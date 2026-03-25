from flask import Blueprint, jsonify, request
from services.calendar_service import list_upcoming_events, create_event, update_event, delete_event
from routes.auth import CONNECTED_ACCOUNTS, is_connected
from routes.demo import is_demo_active, DEMO_CALENDAR_EVENTS
import datetime
import uuid

calendar_bp = Blueprint('calendar_api', __name__)

@calendar_bp.route('/events', methods=['GET'])
def get_events():
    if not is_connected("calendar"):
        return jsonify({"success": False, "error": "Calendar not connected"}), 401

    # Demo mode: return mock events
    if is_demo_active():
        return jsonify({"success": True, "events": DEMO_CALENDAR_EVENTS})

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
        
    data = request.json or {}
    summary = data.get('summary')
    description = data.get('description', '')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    if not all([summary, start_time, end_time]):
        return jsonify({"success": False, "error": "Missing required fields: summary, start_time, end_time"}), 400

    # Demo mode: return fake success
    if is_demo_active():
        return jsonify({"success": True, "event_link": "#", "event_id": "demo_" + uuid.uuid4().hex[:8]})

    credentials = CONNECTED_ACCOUNTS["calendar"]["credentials"]
    success, result = create_event(credentials, summary, description, start_time, end_time)

    if success:
        return jsonify({"success": True, "event_link": result["link"], "event_id": result["id"]})
    else:
        return jsonify({"success": False, "error": result}), 500

@calendar_bp.route('/events/<event_id>', methods=['PUT'])
def edit_event(event_id):
    if not is_connected("calendar"):
        return jsonify({"success": False, "error": "Calendar not connected"}), 401
        
    data = request.json or {}
    summary = data.get('summary')
    description = data.get('description', '')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    if not all([summary, start_time, end_time]):
        return jsonify({"success": False, "error": "Missing required fields: summary, start_time, end_time"}), 400
        
    if is_demo_active():
        return jsonify({"success": True, "event_link": "#", "event_id": event_id})

    credentials = CONNECTED_ACCOUNTS["calendar"]["credentials"]
    success, result = update_event(credentials, event_id, summary, description, start_time, end_time)

    if success:
        return jsonify({"success": True, "event_link": result["link"], "event_id": result["id"]})
    else:
        return jsonify({"success": False, "error": result}), 500

@calendar_bp.route('/events/<event_id>', methods=['DELETE'])
def remove_event(event_id):
    if not is_connected("calendar"):
        return jsonify({"success": False, "error": "Calendar not connected"}), 401
        
    if is_demo_active():
        return jsonify({"success": True})

    credentials = CONNECTED_ACCOUNTS["calendar"]["credentials"]
    success, result = delete_event(credentials, event_id)

    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": result}), 500
