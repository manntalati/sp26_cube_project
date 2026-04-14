import json
import os
from flask import Blueprint, jsonify, request

settings_bp = Blueprint('settings', __name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
ALIASES_FILE = os.path.join(DATA_DIR, 'aliases.json')
# meeting_participants.json stores per-meeting name lists for online fuzzy matching
# (separate from participants.json which stores in-person structured participants with email)
PARTICIPANTS_FILE = os.path.join(DATA_DIR, 'meeting_participants.json')


# ── Aliases (kept for backward compat, no longer used in UI) ──────────────────
def load_aliases():
    if not os.path.exists(ALIASES_FILE):
        return {}
    with open(ALIASES_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_aliases(aliases):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ALIASES_FILE, 'w') as f:
        json.dump(aliases, f, indent=4)

@settings_bp.route('/aliases', methods=['GET'])
def get_aliases():
    return jsonify({"success": True, "aliases": {}})

@settings_bp.route('/aliases', methods=['POST'])
def update_aliases():
    return jsonify({"success": True, "aliases": {}})


# ── Participants (per-meeting name list for fuzzy matching) ───────────────────
def load_participants():
    """Returns { eventId: ["Name1", "Name2", ...] }"""
    if not os.path.exists(PARTICIPANTS_FILE):
        return {}
    with open(PARTICIPANTS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_participants(participants):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PARTICIPANTS_FILE, 'w') as f:
        json.dump(participants, f, indent=4)

@settings_bp.route('/participants', methods=['GET'])
def get_participants():
    participants = load_participants()
    return jsonify({"success": True, "participants": participants})

@settings_bp.route('/participants', methods=['POST'])
def update_participants():
    data = request.json or {}
    participants = data.get('participants')
    if not isinstance(participants, dict):
        return jsonify({"success": False, "error": "Invalid format; expected dict of eventId -> [names]"}), 400
    save_participants(participants)
    return jsonify({"success": True, "participants": participants})
