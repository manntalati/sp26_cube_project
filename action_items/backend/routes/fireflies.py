from flask import Blueprint, jsonify
from services.fireflies_service import get_transcripts, get_transcript_action_items
from routes.auth import CONNECTED_ACCOUNTS, is_connected

fireflies_bp = Blueprint('fireflies', __name__)

@fireflies_bp.route('/transcripts', methods=['GET'])
def fetch_transcripts():
    if not is_connected("fireflies"):
        return jsonify({"success": False, "error": "Fireflies account not connected"}), 401
        
    api_key = CONNECTED_ACCOUNTS["fireflies"]["api_key"]
    success, result = get_transcripts(api_key)
    
    if success:
        return jsonify({"success": True, "transcripts": result})
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
