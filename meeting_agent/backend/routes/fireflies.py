from flask import Blueprint, jsonify
from services.fireflies_service import get_transcripts, get_transcript_action_items
from routes.auth import CONNECTED_ACCOUNTS, is_connected
from services.background_analysis import enqueue_analysis, get_analysis_record
from routes.demo import is_demo_active, DEMO_TRANSCRIPTS

fireflies_bp = Blueprint('fireflies', __name__)

@fireflies_bp.route('/transcripts', methods=['GET'])
def fetch_transcripts():
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401

    # Demo mode: return mock transcripts without hitting Fireflies API
    if is_demo_active():
        return jsonify({"success": True, "transcripts": DEMO_TRANSCRIPTS})

    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    success, result = get_transcripts(api_key)

    if success:
        # Enqueue background analysis for any transcripts we haven't processed yet.
        transcripts = result or []
        for t in transcripts:
            transcript_id = (t or {}).get("id")
            if not transcript_id:
                continue
            rec = get_analysis_record(transcript_id)
            if rec.get("status") == "not_queued":
                enqueue_analysis(transcript_id, api_key)

        return jsonify({"success": True, "transcripts": transcripts})
    else:
        return jsonify({"success": False, "error": result}), 500


@fireflies_bp.route('/transcripts/<transcript_id>/actions', methods=['GET'])
def fetch_transcript_actions(transcript_id):
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401
        
    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    success, result = get_transcript_action_items(api_key, transcript_id)
    
    if success:
        return jsonify({"success": True, "action_items": result})
    else:
        return jsonify({"success": False, "error": result}), 500
