"""
inperson.py — Flask routes for In-Person Notetaker Mode.

All routes live under the /api/inperson prefix (registered in app.py).

Flow:
  1. POST /start          → create DeepgramSession, open WebSocket
  2. POST /audio          → receive PCM-16 chunk, forward to Deepgram
  3. POST /stop           → signal end-of-stream, Deepgram flushes
  4. GET  /transcript     → poll live segments (renders in-meeting overlay)
  5. POST /analyze        → after meeting, enqueue Gemini analysis

The session_id returned by /start is used as the transcript_id in
ANALYSIS_STORE — meaning the existing GET /api/gemini/status/<id>
endpoint works unchanged for post-meeting polling.
"""

import logging
import re

from flask import Blueprint, jsonify, request

from routes.auth import CONNECTED_ACCOUNTS, is_connected
from routes.participants import load_participants
from services.background_analysis import enqueue_analysis_from_text
from services.deepgram_service import create_session, get_session

logger = logging.getLogger(__name__)

inperson_bp = Blueprint("inperson", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# Start
# ─────────────────────────────────────────────────────────────────────────────

@inperson_bp.route("/start", methods=["POST"])
def start_session():
    """
    POST /api/inperson/start
    Body: { "session_id": "<unique id>", "sample_rate": 16000 }

    Creates a DeepgramSession and opens the WebSocket.
    If a session with the same ID is already active, returns it unchanged.
    """
    if not is_connected("deepgram"):
        return jsonify({"success": False, "error": "Deepgram API key not connected"}), 401
    if not is_connected("gemini"):
        return jsonify({"success": False, "error": "Gemini API key not connected"}), 401

    data = request.json or {}
    session_id = data.get("session_id")
    if not session_id:
        return jsonify({"success": False, "error": "session_id is required"}), 400

    sample_rate = int(data.get("sample_rate", 16000))

    # Idempotent: reuse an already-active session
    existing = get_session(session_id)
    if existing and existing.status in ("connecting", "recording"):
        return jsonify({"success": True, "session_id": session_id, "status": existing.status})

    api_key = CONNECTED_ACCOUNTS["deepgram"]["api_key"]
    session = create_session(session_id=session_id, api_key=api_key, sample_rate=sample_rate)
    session.start()

    logger.info("[InPerson] Session started: %s (rate=%dHz)", session_id, sample_rate)
    return jsonify({"success": True, "session_id": session_id, "status": session.status})


# ─────────────────────────────────────────────────────────────────────────────
# Audio streaming
# ─────────────────────────────────────────────────────────────────────────────

@inperson_bp.route("/audio", methods=["POST"])
def receive_audio():
    """
    POST /api/inperson/audio?session_id=<id>
    Body: raw PCM-16 bytes (Content-Type: application/octet-stream)

    This endpoint is called ~4 times/second by the renderer's ScriptProcessorNode.
    It must be fast: just queue the bytes and return immediately.
    """
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"success": False, "error": "session_id query param required"}), 400

    session = get_session(session_id)
    if not session:
        return jsonify({"success": False, "error": "Session not found"}), 404

    if session.status not in ("connecting", "recording"):
        # Session may have errored or stopped; don't crash, just ignore
        return jsonify({"success": False, "error": f"Session not active (status={session.status})"}), 400

    audio_data = request.get_data()
    if audio_data:
        session.send_audio(audio_data)

    return "", 204  # No-content for minimal response size


# ─────────────────────────────────────────────────────────────────────────────
# Stop
# ─────────────────────────────────────────────────────────────────────────────

@inperson_bp.route("/stop", methods=["POST"])
def stop_session():
    """
    POST /api/inperson/stop
    Body: { "session_id": "<id>" }

    Signals end-of-stream.  Deepgram will flush remaining audio, emit final
    results, and close the WebSocket.  The renderer should poll /transcript
    until status='stopped' before calling /analyze.
    """
    data = request.json or {}
    session_id = data.get("session_id")
    if not session_id:
        return jsonify({"success": False, "error": "session_id required"}), 400

    session = get_session(session_id)
    if not session:
        return jsonify({"success": False, "error": "Session not found"}), 404

    session.stop()
    logger.info("[InPerson] Session stop requested: %s", session_id)
    return jsonify({"success": True, "status": session.status})


# ─────────────────────────────────────────────────────────────────────────────
# Live transcript (polling)
# ─────────────────────────────────────────────────────────────────────────────

@inperson_bp.route("/transcript", methods=["GET"])
def get_transcript():
    """
    GET /api/inperson/transcript?session_id=<id>

    Returns the live transcript segments and current session status.
    The renderer polls this every second to display the live transcript
    in the in-meeting overlay.
    """
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"success": False, "error": "session_id required"}), 400

    session = get_session(session_id)
    if not session:
        return jsonify({"success": False, "error": "Session not found"}), 404

    return jsonify({
        "success": True,
        "status": session.status,
        "error": session.error,
        "segments": session.get_segments(),
        "transcript_text": session.get_transcript_text(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Analyze (enqueue Gemini)
# ─────────────────────────────────────────────────────────────────────────────

@inperson_bp.route("/analyze", methods=["POST"])
def analyze_session():
    """
    POST /api/inperson/analyze
    Body: { "session_id": "<id>" }

    Builds the Fireflies-format transcript text from the completed session
    and injects it into the exact same Gemini analysis pipeline used by
    online meetings (enqueue_analysis_from_text).

    The session_id is used as the transcript_id in ANALYSIS_STORE, so the
    existing GET /api/gemini/status/<id> endpoint works with no changes.
    """
    data = request.json or {}
    session_id = data.get("session_id")
    if not session_id:
        return jsonify({"success": False, "error": "session_id required"}), 400

    if not is_connected("gemini"):
        return jsonify({"success": False, "error": "Gemini API key not connected"}), 401

    session = get_session(session_id)
    if not session:
        return jsonify({"success": False, "error": "Session not found"}), 404

    transcript_text = session.get_transcript_text()

    # Load the structured participant roster saved by the user in the UI.
    # [{speaker_id: "Speaker 0", name: "Alice Smith", email: "alice@example.com"}, ...]
    participants = load_participants()

    # Apply deterministic speaker-label substitution in the transcript text so
    # Gemini sees "Alice Smith:" instead of "Speaker 0:".  This is exact and
    # does not rely on fuzzy matching.
    for p in participants:
        label = p.get("speaker_id", "").strip()
        name = p.get("name", "").strip()
        if label and name:
            transcript_text = re.sub(
                rf'(?im)^{re.escape(label)}:',
                f'{name}:',
                transcript_text,
            )

    gemini_key = CONNECTED_ACCOUNTS["gemini"]["api_key"]

    logger.info(
        "[InPerson] Enqueuing Gemini analysis for session %s (%d chars, %d participants)",
        session_id,
        len(transcript_text),
        len(participants),
    )

    # action_items=[] because Deepgram doesn't pre-extract them;
    # Gemini will identify all action items from the raw transcript.
    ok, rec = enqueue_analysis_from_text(
        session_id=session_id,
        transcript_text=transcript_text,
        action_items=[],
        gemini_api_key=gemini_key,
        participants=participants,
    )

    if not ok:
        return jsonify({"success": False, "error": rec.get("error", "Failed to enqueue")}), 400

    return jsonify({"success": True, "analysis": rec})
