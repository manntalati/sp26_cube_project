import json
import os
from flask import Blueprint, jsonify, request

settings_bp = Blueprint('settings', __name__)
ALIASES_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'aliases.json')

def load_aliases():
    if not os.path.exists(ALIASES_FILE):
        return {}
    with open(ALIASES_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_aliases(aliases):
    os.makedirs(os.path.dirname(ALIASES_FILE), exist_ok=True)
    with open(ALIASES_FILE, 'w') as f:
        json.dump(aliases, f, indent=4)

@settings_bp.route('/aliases', methods=['GET'])
def get_aliases():
    aliases = load_aliases()
    return jsonify({"success": True, "aliases": aliases})

@settings_bp.route('/aliases', methods=['POST'])
def update_aliases():
    data = request.json or {}
    aliases = data.get('aliases')
    if not isinstance(aliases, dict):
        return jsonify({"success": False, "error": "Invalid aliases format; expected dictionary"}), 400
    
    save_aliases(aliases)
    return jsonify({"success": True, "aliases": aliases})
