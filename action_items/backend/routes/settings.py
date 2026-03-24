import json
import os
from flask import Blueprint, jsonify, request

settings_bp = Blueprint('settings', __name__)
ALIASES_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'aliases.json')

def load_aliases():
    if not os.path.exists(ALIASES_FILE):
<<<<<<< HEAD
        return []
    with open(ALIASES_FILE, 'r') as f:
        try:
            data = json.load(f)
            if isinstance(data, dict):
                # Migration: if it was a dict, just take the values (correct names)
                return list(set(data.values()))
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
=======
        return {}
    with open(ALIASES_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0

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
<<<<<<< HEAD
    if not isinstance(aliases, list):
        return jsonify({"success": False, "error": "Invalid aliases format; expected list of names"}), 400
    
    # Clean up names
    aliases = [name.strip() for name in aliases if name and isinstance(name, str)]
    # Unique names only
    aliases = sorted(list(set(aliases)))
=======
    if not isinstance(aliases, dict):
        return jsonify({"success": False, "error": "Invalid aliases format; expected dictionary"}), 400
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
    
    save_aliases(aliases)
    return jsonify({"success": True, "aliases": aliases})
