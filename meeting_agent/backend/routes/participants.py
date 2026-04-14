"""
participants.py — Flask routes for managing in-person meeting participants.

Participants are stored separately from aliases.  Each participant record has:
  speaker_id  - the Deepgram label, e.g. "Speaker 0"
  name        - the person's real name
  email       - email address used when pushing action items to Google Calendar

Stored in data/participants.json as a JSON array.
"""
import json
import os

from flask import Blueprint, jsonify, request

participants_bp = Blueprint("participants", __name__)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_PARTICIPANTS_FILE = os.path.join(_DATA_DIR, "participants.json")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_participants() -> list:
    """Return the participants list, or [] if the file does not exist."""
    try:
        with open(_PARTICIPANTS_FILE, "r") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []


def save_participants(participants: list) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_PARTICIPANTS_FILE, "w") as f:
        json.dump(participants, f, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@participants_bp.route("", methods=["GET"])
def get_participants():
    """GET /api/participants — return the current participant list."""
    return jsonify({"success": True, "participants": load_participants()})


@participants_bp.route("", methods=["POST"])
def update_participants():
    """
    POST /api/participants
    Body: { "participants": [ {speaker_id, name, email}, ... ] }

    Replaces the entire participant list.
    """
    data = request.json or {}
    participants = data.get("participants")
    if not isinstance(participants, list):
        return jsonify({"success": False, "error": "Expected {participants: [...]}"}), 400

    # Validate each entry
    cleaned = []
    for p in participants:
        if not isinstance(p, dict):
            continue
        speaker_id = str(p.get("speaker_id", "")).strip()
        name = str(p.get("name", "")).strip()
        email = str(p.get("email", "")).strip()
        if speaker_id and name:
            cleaned.append({"speaker_id": speaker_id, "name": name, "email": email})

    save_participants(cleaned)
    return jsonify({"success": True, "participants": cleaned})
