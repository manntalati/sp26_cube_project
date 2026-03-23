import threading
import time
from dataclasses import dataclass
from queue import Queue, Empty
from typing import Any, Dict, Optional, Tuple

from services.fireflies_service import get_transcript_full
from services.gemini_service import analyze_action_items


@dataclass(frozen=True)
class AnalysisJob:
    transcript_id: str
    fireflies_api_key: str
    gemini_api_key: str


# transcript_id -> record
ANALYSIS_STORE: Dict[str, Dict[str, Any]] = {}

_queue: "Queue[AnalysisJob]" = Queue()
_worker_started = False
_lock = threading.Lock()


def _now_ms() -> int:
    return int(time.time() * 1000)


def get_analysis_record(transcript_id: str) -> Dict[str, Any]:
    """
    Returns the current analysis record (creates a default one if missing).
    """
    with _lock:
        rec = ANALYSIS_STORE.get(transcript_id)
        if not rec:
            rec = {
                "transcript_id": transcript_id,
                "status": "not_queued",  # not_queued | queued | processing | ready | error
                "items": None,
                "error": None,
                "updated_at_ms": _now_ms(),
            }
            ANALYSIS_STORE[transcript_id] = rec
        return dict(rec)


def enqueue_analysis(transcript_id: str, fireflies_api_key: str, gemini_api_key: str = None, force: bool = False) -> Tuple[bool, Dict[str, Any]]:
    """
    Enqueues an analysis job if not already ready/processing/queued.
    If force=True, re-enqueues even if 'ready'.
    Returns (True, record).
    """
    if not transcript_id:
        return False, {"error": "transcript_id is required"}
    if not fireflies_api_key:
        return False, {"error": "fireflies_api_key is required"}

    with _lock:
        rec = ANALYSIS_STORE.get(transcript_id)
        if rec:
            status = rec.get("status")
            if status in {"queued", "processing"} or (status == "ready" and not force):
                return True, dict(rec)

        ANALYSIS_STORE[transcript_id] = {
            "transcript_id": transcript_id,
            "status": "queued",
            "items": None,
            "error": None,
            "updated_at_ms": _now_ms(),
        }

    _queue.put(AnalysisJob(transcript_id=transcript_id, fireflies_api_key=fireflies_api_key, gemini_api_key=gemini_api_key or ""))
    return True, get_analysis_record(transcript_id)


def _set_record(transcript_id: str, **updates: Any) -> None:
    with _lock:
        rec = ANALYSIS_STORE.get(transcript_id) or {"transcript_id": transcript_id}
        rec.update(updates)
        rec["updated_at_ms"] = _now_ms()
        ANALYSIS_STORE[transcript_id] = rec


def update_analysis_record(transcript_id: str, items: list) -> bool:
    """
    Updates the items list for an existing analysis record.
    Returns True if updated, False if record doesn't exist.
    """
    with _lock:
        if transcript_id not in ANALYSIS_STORE:
            return False
        ANALYSIS_STORE[transcript_id]["items"] = items
        ANALYSIS_STORE[transcript_id]["updated_at_ms"] = _now_ms()
        return True


def _worker_loop() -> None:
    while True:
        try:
            job = _queue.get(timeout=1)
        except Empty:
            continue

        transcript_id = job.transcript_id
        
        try:
            _set_record(transcript_id, status="processing", error=None)

            ok, ff_result = get_transcript_full(job.fireflies_api_key, transcript_id)
            if not ok:
                _set_record(transcript_id, status="error", error=f"Fireflies fetch failed: {ff_result}", items=None)
                _queue.task_done()
                continue

            transcript_text = ff_result.get("transcript_text", "")
            action_items = ff_result.get("action_items", [])

            ok, gemini_result = analyze_action_items(transcript_text, action_items, api_key=job.gemini_api_key or None)
            if not ok:
                _set_record(transcript_id, status="error", error=f"Gemini analysis failed: {gemini_result}", items=None)
                _queue.task_done()
                continue

            _set_record(transcript_id, status="ready", items=gemini_result, error=None)
            _queue.task_done()
        except Exception as e:
            _set_record(transcript_id, status="error", error=f"Unhandled internal error: {str(e)}", items=None)
            _queue.task_done()


def start_background_worker() -> None:
    """
    Starts the analysis worker exactly once.
    """
    global _worker_started
    if _worker_started:
        return

    with _lock:
        if _worker_started:
            return
        t = threading.Thread(target=_worker_loop, name="gemini-analysis-worker", daemon=True)
        t.start()
        _worker_started = True

