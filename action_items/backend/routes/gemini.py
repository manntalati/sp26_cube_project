from flask import Blueprint, jsonify, request
from services.fireflies_service import get_transcript_full
from services.gemini_service import analyze_action_items
from routes.auth import CONNECTED_ACCOUNTS, is_connected
from services.background_analysis import enqueue_analysis, get_analysis_record

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

    data = request.json or {}
    transcript_id = data.get("transcript_id")
    if not transcript_id:
        return jsonify({"success": False, "error": "transcript_id is required"}), 400

    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    ok, rec = enqueue_analysis(transcript_id, api_key)
    if not ok:
        return jsonify({"success": False, "error": rec.get("error", "Failed to enqueue")}), 400

    return jsonify({"success": True, "analysis": rec})


@gemini_bp.route("/analyze", methods=["POST"])
def analyze_transcript():
    """
    POST /api/gemini/analyze
    Body: { "transcript_id": "<fireflies transcript id>" }

    1. Fetches the full transcript text + existing action items from Fireflies.
    2. Sends them to Gemini for enrichment and gap analysis.
    3. Returns the structured list of action items.
    """
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401

    data = request.json or {}
    transcript_id = data.get("transcript_id")
    if not transcript_id:
        return jsonify({"success": False, "error": "transcript_id is required"}), 400

    # Fast path: return cached result if already ready
    cached = get_analysis_record(transcript_id)
    if cached.get("status") == "ready" and cached.get("items") is not None:
        return jsonify({"success": True, "items": cached["items"], "cached": True})

    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]

    # Step 1 — fetch Fireflies data
    ok, ff_result = get_transcript_full(api_key, transcript_id)
    if not ok:
        return jsonify({"success": False, "error": f"Fireflies fetch failed: {ff_result}"}), 500

    transcript_text = ff_result.get("transcript_text", "")
    action_items = ff_result.get("action_items", [])

    # Step 2 — call Gemini
    ok, gemini_result = analyze_action_items(transcript_text, action_items)
    if not ok:
        return jsonify({"success": False, "error": f"Gemini analysis failed: {gemini_result}"}), 500

    return jsonify({"success": True, "items": gemini_result})
