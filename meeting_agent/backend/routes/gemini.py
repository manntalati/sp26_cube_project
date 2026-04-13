from flask import Blueprint, jsonify, request
from services.fireflies_service import get_transcript_full
from services.gemini_service import analyze_action_items
from routes.auth import CONNECTED_ACCOUNTS, is_connected
from services.background_analysis import enqueue_analysis, get_analysis_record, update_analysis_record

gemini_bp = Blueprint("gemini", __name__)

@gemini_bp.route("/status/<transcript_id>", methods=["GET"])
def get_status(transcript_id):
    """
    GET /api/gemini/status/<transcript_id>
    Returns cached status + items (when ready).
    """
    rec = get_analysis_record(transcript_id)
    return jsonify({"success": True, "analysis": rec})


@gemini_bp.route("/enqueue", methods=["POST"])
def enqueue():
    """
    POST /api/gemini/enqueue
    Body: { "transcript_id": "<fireflies transcript id>" }
    Enqueues analysis in the background.
    """
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401
    if not is_connected("gemini"):
        return jsonify({"success": False, "error": "Gemini API key not connected"}), 401

    data = request.json or {}
    transcript_id = data.get("transcript_id")
    force = data.get("force", False)
    if not transcript_id:
        return jsonify({"success": False, "error": "transcript_id is required"}), 400

    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    gemini_key = CONNECTED_ACCOUNTS["gemini"]["api_key"]
    ok, rec = enqueue_analysis(transcript_id, api_key, gemini_key, force=force)
    if not ok:
        return jsonify({"success": False, "error": rec.get("error", "Failed to enqueue")}), 400

    return jsonify({"success": True, "analysis": rec})


@gemini_bp.route("/analyze", methods=["POST"])
def analyze_transcript():
    """
    POST /api/gemini/analyze
    Body: { "transcript_id": "<fireflies transcript id>" }
    """
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401
    if not is_connected("gemini"):
        return jsonify({"success": False, "error": "Gemini API key not connected"}), 401

    data = request.json or {}
    transcript_id = data.get("transcript_id")
    if not transcript_id:
        return jsonify({"success": False, "error": "transcript_id is required"}), 400

    # Fast path: return cached result if already ready
    cached = get_analysis_record(transcript_id)
    if cached.get("status") == "ready" and cached.get("items") is not None:
        return jsonify({"success": True, "items": cached["items"], "tldrs": cached.get("tldrs"), "cached": True})

    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    gemini_key = CONNECTED_ACCOUNTS["gemini"]["api_key"]

    ok, ff_result = get_transcript_full(api_key, transcript_id)
    if not ok:
        return jsonify({"success": False, "error": f"Fireflies fetch failed: {ff_result}"}), 500

    transcript_text = ff_result.get("transcript_text", "")
    action_items = ff_result.get("action_items", [])

    ok, gemini_result = analyze_action_items(transcript_text, action_items, api_key=gemini_key)
    if not ok:
        return jsonify({"success": False, "error": f"Gemini analysis failed: {gemini_result}"}), 500

    return jsonify({"success": True, "items": gemini_result.get("items", []), "tldrs": gemini_result})

@gemini_bp.route("/save", methods=["POST"])
def save_analysis():
    """
    POST /api/gemini/save
    Body: { "transcript_id": "<id>", "items": [<array of updated items>] }
    Saves edited action items back to the analysis record so changes persist.
    """
    data = request.json or {}
    transcript_id = data.get("transcript_id")
    items = data.get("items")
    
    if not transcript_id or items is None:
        return jsonify({"success": False, "error": "Missing transcript_id or items"}), 400
        
    if update_analysis_record(transcript_id, items):
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "Record not found"}), 404
