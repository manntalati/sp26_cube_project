"""
deepgram_service.py — In-person recording transcription via Deepgram Streaming API.

Architecture:
  - Each in-person meeting session is a DeepgramSession instance
  - The session opens a WebSocket to Deepgram in a background thread
  - Raw PCM-16 audio bytes arrive from the Flask /inperson/audio endpoint
    and are queued for forwarding to Deepgram
  - Deepgram returns final, speaker-diarized transcript segments
  - get_transcript_text() adapts those segments to the same plain-text format
    that Fireflies produces: "Speaker N: sentence text"
    → downstream Gemini pipeline requires zero changes

Deepgram parameters used:
  model=nova-2        — best accuracy
  diarize=true        — speaker labels (0, 1, 2 …)
  punctuate=true      — natural punctuation
  encoding=linear16   — raw PCM 16-bit little-endian
  sample_rate         — set by caller (from AudioContext.sampleRate)
  channels=1          — mono microphone
  interim_results=false — only emit final segments; simpler downstream
  endpointing=300     — 300 ms silence → end of utterance
"""

import json
import logging
import queue
import threading
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

DEEPGRAM_BASE_URL = "wss://api.deepgram.com/v1/listen"
DEEPGRAM_REST_URL = "https://api.deepgram.com"


# ─────────────────────────────────────────────────────────────────────────────
# Session
# ─────────────────────────────────────────────────────────────────────────────

class DeepgramSession:
    """
    Manages a single in-person recording session.

    Lifecycle:
        create_session() → session.start() → session.send_audio(bytes) × N
        → session.stop() → session.get_transcript_text()
    """

    def __init__(self, session_id: str, api_key: str, sample_rate: int = 16000):
        self.session_id = session_id
        self.api_key = api_key
        self.sample_rate = sample_rate

        # Status: idle | connecting | recording | stopping | stopped | error
        self.status: str = "idle"
        self.error: Optional[str] = None

        # Accumulated transcript segments from Deepgram final results
        self._segments: List[Dict] = []
        self._lock = threading.Lock()

        # Audio pipeline — PCM bytes arrive via HTTP POST, queued for WebSocket
        self._audio_queue: "queue.Queue[bytes]" = queue.Queue()
        self._stop_event = threading.Event()
        self._ws_thread: Optional[threading.Thread] = None
        self._ws = None  # websocket.WebSocketApp instance

    # ── Public API ────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Connect to Deepgram WebSocket in a background thread."""
        self.status = "connecting"
        self._ws_thread = threading.Thread(
            target=self._run_websocket,
            name=f"deepgram-{self.session_id}",
            daemon=True,
        )
        self._ws_thread.start()

    def send_audio(self, pcm_bytes: bytes) -> None:
        """Queue raw PCM-16 bytes for forwarding to Deepgram."""
        if self.status in ("connecting", "recording"):
            self._audio_queue.put(pcm_bytes)

    def stop(self) -> None:
        """
        Signal end-of-stream.  The audio loop will drain the queue,
        send Deepgram's CloseStream message, and wait for the WebSocket
        to close naturally before setting status='stopped'.
        """
        self._stop_event.set()
        self.status = "stopping"

    def get_segments(self) -> List[Dict]:
        """Thread-safe copy of accumulated transcript segments."""
        with self._lock:
            return list(self._segments)

    def get_transcript_text(self) -> str:
        """
        Returns a Fireflies-compatible plain-text transcript.

        Consecutive utterances from the same speaker are merged into one
        paragraph so the Gemini prompt is clean and readable.

        Example output:
            Speaker 0: We need to finish the migration by Friday.
            Speaker 1: I can own that. Let me check the timeline.
            Speaker 0: Great, let's add it as an action item.
        """
        with self._lock:
            if not self._segments:
                return ""

            lines: List[str] = []
            prev_speaker: Optional[int] = None
            buf: List[str] = []

            for seg in self._segments:
                speaker = seg["speaker"]
                text = seg["text"].strip()
                if not text:
                    continue
                if speaker == prev_speaker:
                    buf.append(text)
                else:
                    if buf and prev_speaker is not None:
                        lines.append(f"Speaker {prev_speaker}: {' '.join(buf)}")
                    buf = [text]
                    prev_speaker = speaker

            if buf and prev_speaker is not None:
                lines.append(f"Speaker {prev_speaker}: {' '.join(buf)}")

            return "\n".join(lines)

    # ── Internal WebSocket thread ─────────────────────────────────────────────

    def _build_ws_url(self) -> str:
        return (
            f"{DEEPGRAM_BASE_URL}"
            f"?model=nova-2"
            f"&language=en"
            f"&diarize=true"
            f"&punctuate=true"
            f"&encoding=linear16"
            f"&sample_rate={self.sample_rate}"
            f"&channels=1"
            f"&interim_results=false"
            f"&endpointing=300"
        )

    def _run_websocket(self) -> None:
        """WebSocket thread: connect → stream audio → receive transcript → close."""
        try:
            import websocket  # websocket-client
        except ImportError:
            self.status = "error"
            self.error = (
                "websocket-client not installed. "
                "Run: pip install websocket-client"
            )
            logger.error("[Deepgram] %s", self.error)
            return

        url = self._build_ws_url()
        # websocket-client expects headers as a list of "Key: Value" strings
        headers = [f"Authorization: Token {self.api_key}"]

        def on_open(ws):
            self.status = "recording"
            logger.info("[Deepgram] Connected (session=%s, rate=%dHz)", self.session_id, self.sample_rate)
            # Start the audio forwarding loop in its own thread
            threading.Thread(
                target=self._send_audio_loop,
                args=(ws,),
                name=f"deepgram-audio-{self.session_id}",
                daemon=True,
            ).start()

        def on_message(ws, message):
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "Results" and data.get("is_final"):
                    alts = (data.get("channel") or {}).get("alternatives") or []
                    if alts:
                        words = alts[0].get("words") or []
                        if words:
                            self._process_words(words)

                elif msg_type == "Error":
                    err_msg = data.get("message", "Unknown Deepgram error")
                    logger.error("[Deepgram] Server error: %s", err_msg)
                    if self.status not in ("stopped", "stopping"):
                        self.status = "error"
                        self.error = err_msg

            except Exception as exc:
                logger.exception("[Deepgram] on_message exception: %s", exc)

        def on_error(ws, error):
            logger.error("[Deepgram] WebSocket error (session=%s): %s", self.session_id, error)
            if self.status not in ("stopped", "stopping", "error"):
                self.status = "error"
                self.error = str(error)

        def on_close(ws, close_status_code, close_msg):
            logger.info(
                "[Deepgram] Closed (session=%s, code=%s)",
                self.session_id,
                close_status_code,
            )
            if self.status not in ("error",):
                self.status = "stopped"

        self._ws = websocket.WebSocketApp(
            url,
            header=headers,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        # Blocks until the connection closes
        self._ws.run_forever()

    def _send_audio_loop(self, ws) -> None:
        """
        Reads PCM bytes from the audio queue and forwards them to Deepgram.
        Runs until the stop event is set, then drains remaining audio and
        sends Deepgram's CloseStream message.
        """
        import websocket as ws_lib

        while not self._stop_event.is_set():
            try:
                chunk = self._audio_queue.get(timeout=0.05)
                ws.send(chunk, opcode=ws_lib.ABNF.OPCODE_BINARY)
            except queue.Empty:
                continue
            except Exception as exc:
                logger.error("[Deepgram] Audio send error: %s", exc)
                break

        # Drain any audio that arrived before the stop signal
        while True:
            try:
                chunk = self._audio_queue.get_nowait()
                ws.send(chunk, opcode=ws_lib.ABNF.OPCODE_BINARY)
            except queue.Empty:
                break
            except Exception:
                break

        # Tell Deepgram we're done; it will flush, emit remaining results, and close
        try:
            ws.send(json.dumps({"type": "CloseStream"}))
            logger.info("[Deepgram] CloseStream sent (session=%s)", self.session_id)
        except Exception:
            pass

    def _process_words(self, words: List[Dict]) -> None:
        """
        Groups a list of Deepgram word objects by speaker into segments.

        Deepgram word schema:
            { word, punctuated_word, start, end, confidence, speaker, speaker_confidence }
        """
        if not words:
            return

        groups: List[Dict] = []
        cur_speaker: int = words[0].get("speaker", 0)
        cur_words: List[str] = []
        cur_start: float = words[0].get("start", 0.0)
        cur_end: float = 0.0

        for w in words:
            speaker: int = w.get("speaker", 0)
            text: str = (w.get("punctuated_word") or w.get("word") or "").strip()
            end: float = w.get("end", 0.0)

            if speaker != cur_speaker:
                if cur_words:
                    groups.append({
                        "speaker": cur_speaker,
                        "text": " ".join(cur_words),
                        "start": cur_start,
                        "end": cur_end,
                    })
                cur_speaker = speaker
                cur_words = [text] if text else []
                cur_start = w.get("start", 0.0)
            else:
                if text:
                    cur_words.append(text)
            cur_end = end

        if cur_words:
            groups.append({
                "speaker": cur_speaker,
                "text": " ".join(cur_words),
                "start": cur_start,
                "end": cur_end,
            })

        with self._lock:
            self._segments.extend(groups)


# ─────────────────────────────────────────────────────────────────────────────
# Session registry
# ─────────────────────────────────────────────────────────────────────────────

_sessions: Dict[str, DeepgramSession] = {}
_sessions_lock = threading.Lock()


def create_session(session_id: str, api_key: str, sample_rate: int = 16000) -> DeepgramSession:
    """Create and register a new DeepgramSession."""
    session = DeepgramSession(session_id=session_id, api_key=api_key, sample_rate=sample_rate)
    with _sessions_lock:
        _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[DeepgramSession]:
    """Look up a session by ID (returns None if not found)."""
    with _sessions_lock:
        return _sessions.get(session_id)


def remove_session(session_id: str) -> None:
    """Remove a session from the registry (does NOT stop it)."""
    with _sessions_lock:
        _sessions.pop(session_id, None)


def validate_deepgram_key(api_key: str):
    """
    Validates a Deepgram API key by listing projects (lightweight REST call).
    Returns (True, "ok") on success, (False, error_message) on failure.
    """
    import requests as req
    try:
        r = req.get(
            f"{DEEPGRAM_REST_URL}/v1/projects",
            headers={"Authorization": f"Token {api_key}"},
            timeout=10,
        )
        if r.status_code == 200:
            return True, "ok"
        elif r.status_code == 401:
            return False, "Invalid Deepgram API key"
        else:
            return False, f"Deepgram returned HTTP {r.status_code}"
    except Exception as exc:
        return False, str(exc)
