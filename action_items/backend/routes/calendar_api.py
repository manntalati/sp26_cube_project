from flask import Blueprint, jsonify, request
from services.calendar_service import list_upcoming_events, create_event
from routes.auth import CONNECTED_ACCOUNTS, is_connected
import datetime

calendar_bp = Blueprint('calendar_api', __name__)

@calendar_bp.route('/events', methods=['GET'])
def get_events():
    if not is_connected("calendar"):
        return jsonify({"success": False, "error": "Calendar not connected"}), 401
        
    credentials = CONNECTED_ACCOUNTS["calendar"]["credentials"]
    limit = int(request.args.get('limit', 10))
    
    success, result = list_upcoming_events(credentials, max_results=limit)
    
    if success:
        return jsonify({"success": True, "events": result})
    else:
        return jsonify({"success": False, "error": result}), 500

@calendar_bp.route('/events', methods=['POST'])
def add_event():
    if not is_connected("calendar"):
        return jsonify({"success": False, "error": "Calendar not connected"}), 401
        
    data = request.json
    summary = data.get('summary')
    description = data.get('description', '')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    if not all([summary, start_time, end_time]):
        return jsonify({"success": False, "error": "Missing required fields"}), 400
        
    credentials = CONNECTED_ACCOUNTS["calendar"]["credentials"]
    success, result = create_event(credentials, summary, description, start_time, end_time)
    
    if success:
        return jsonify({"success": True, "event_link": result})
    else:
        return jsonify({"success": False, "error": result}), 500
