from flask import Blueprint, request, jsonify, session
from services.fireflies_service import validate_api_key
from services.calendar_service import get_google_auth_flow
from services.gemini_service import validate_gemini_key
import os
import json
import tempfile
import fcntl

# Path to the file used to persist pending OAuth flows across Werkzeug processes
_OAUTH_STATE_FILE = os.path.join(tempfile.gettempdir(), 'action_item_agent_oauth_flows.json')

def _load_oauth_flows():
    """Read persisted OAuth flow state from disk."""
    try:
        with open(_OAUTH_STATE_FILE, 'r') as f:
            fcntl.flock(f, fcntl.LOCK_SH)
            data = json.load(f)
            fcntl.flock(f, fcntl.LOCK_UN)
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save_oauth_flows(flows):
    """Write OAuth flow state to disk atomically."""
    with open(_OAUTH_STATE_FILE, 'w') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        json.dump(flows, f)
        fcntl.flock(f, fcntl.LOCK_UN)

def _pop_oauth_flow(state):
    """Retrieve and remove a pending OAuth flow entry by state key."""
    flows = _load_oauth_flows()
    entry = flows.pop(state, None)
    if entry is not None:
        _save_oauth_flows(flows)
    return entry

def _add_oauth_flow(state, data):
    """Add a new pending OAuth flow entry."""
    flows = _load_oauth_flows()
    flows[state] = data
    _save_oauth_flows(flows)

auth_bp = Blueprint('auth', __name__)

# Basic in-memory store for connected accounts for this prototype.
# In a real app this would be a database based on a user ID.
CONNECTED_ACCOUNTS = {
    "fireflies": None,  # Will store {"email": "...", "name": "...", "api_key": "..."}
    "calendar": None,   # Will store {"email": "...", "credentials": {...}}
    "gemini": None       # Will store {"api_key": "..."}
}

# NOTE: Pending OAuth flows are now persisted to disk (see _load_oauth_flows / _save_oauth_flows)
# so they survive across Werkzeug's two debug-mode processes and server restarts.

@auth_bp.route('/status', methods=['GET'])
def get_status():
    """Returns the current connection status for both services."""
    return jsonify({
        "fireflies": {
            "connected": is_connected("fireflies"),
            "email": CONNECTED_ACCOUNTS["fireflies"]["email"] if is_connected("fireflies") else None,
            "name": CONNECTED_ACCOUNTS["fireflies"]["name"] if is_connected("fireflies") else None
        },
        "calendar": {
            "connected": is_connected("calendar"),
            "email": CONNECTED_ACCOUNTS["calendar"]["email"] if is_connected("calendar") else None
        },
        "gemini": {
            "connected": is_connected("gemini")
        }
    })

def is_connected(service):
    return CONNECTED_ACCOUNTS.get(service) is not None

@auth_bp.route('/fireflies', methods=['POST'])
def connect_fireflies():
    """Validates the Fireflies API Key and stores it."""
    data = request.json
    api_key = data.get('api_key')
    
    if not api_key:
        return jsonify({"success": False, "error": "API key is required"}), 400
        
    success, result = validate_api_key(api_key)
    
    if success:
        # result may be None if Fireflies returned a null user object
        if not result:
            return jsonify({"success": False, "error": "API key was accepted but no user data returned. Please check your Fireflies API key."}), 401
        # Store in our mock database
        CONNECTED_ACCOUNTS["fireflies"] = {
            "api_key": api_key,
            "email": result.get("email"),
            "name": result.get("name")
        }
        return jsonify({
            "success": True, 
            "user": result
        })
    else:
        return jsonify({"success": False, "error": result}), 401

@auth_bp.route('/fireflies/disconnect', methods=['POST'])
def disconnect_fireflies():
    CONNECTED_ACCOUNTS["fireflies"] = None
    return jsonify({"success": True})


# Google Calendar OAuth routes
@auth_bp.route('/google', methods=['POST'])
def auth_google():
    """Initiates the Google OAuth 2.0 flow with user-provided credentials."""
    data = request.json or {}
    client_id = data.get('client_id')
    client_secret = data.get('client_secret')

    if not client_id or not client_secret:
        return jsonify({"success": False, "error": "Client ID and Client Secret are required"}), 400

    flow = get_google_auth_flow(client_id=client_id, client_secret=client_secret)
    if not flow:
        return jsonify({"success": False, "error": "Failed to initialize Google OAuth flow"}), 500
        
    # Generate URL for request to Google's OAuth 2.0 server.
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true')
    
    # Persist credentials keyed by the OAuth state param to disk so the callback
    # can retrieve them even in a different process (Werkzeug debug reloader).
    _add_oauth_flow(state, {
        'client_id': client_id,
        'client_secret': client_secret
    })
    
    return jsonify({"auth_url": authorization_url})


@auth_bp.route('/google/callback', methods=['GET'])
def auth_google_callback():
    """Handles the OAuth 2.0 server response."""
    state = request.args.get('state')
    
    # Look up the credentials saved during the initial /google POST (read from disk)
    pending = _pop_oauth_flow(state) if state else None
    if not pending:
        return "OAuth state not found. Please try connecting again. (state=" + str(state) + ")", 400
    
    client_id = pending['client_id']
    client_secret = pending['client_secret']
    
    flow = get_google_auth_flow(client_id=client_id, client_secret=client_secret)
    if not flow:
        return "Server config error", 500

    flow.fetch_token(authorization_response=request.url)

    credentials = flow.credentials
    # Convert credentials object to dict for storage
    credentials_dict = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }
    
    # For a real app, we'd fetch the user's email via the Google People API, 
    # but for this prototype we'll just store the credentials
    CONNECTED_ACCOUNTS["calendar"] = {
        "email": "Google Calendar User", # Mock email, in real app fetch from profile
        "credentials": credentials_dict
    }

    # Return a success page (Electron overlay polls /api/auth/status instead of redirect)
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Connected</title>
    <style>body{font-family:system-ui;background:#0c0c10;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
    .card{text-align:center;padding:2rem;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)}
    h1{color:#34d399;margin:0 0 0.5rem}p{color:#a0a0a0;margin:0}</style>
    </head>
    <body><div class="card"><h1>Connected!</h1><p>Google Calendar is now linked. You can close this tab and return to Meeting Agent.</p></div></body>
    </html>
    """

@auth_bp.route('/calendar/disconnect', methods=['POST'])
def disconnect_calendar():
    CONNECTED_ACCOUNTS["calendar"] = None
    return jsonify({"success": True})


# Gemini API key routes
@auth_bp.route('/gemini', methods=['POST'])
def connect_gemini():
    """Validates the Gemini API key and stores it."""
    data = request.json or {}
    api_key = data.get('api_key')

    if not api_key:
        return jsonify({"success": False, "error": "API key is required"}), 400

    success, result = validate_gemini_key(api_key)
    if success:
        CONNECTED_ACCOUNTS["gemini"] = {"api_key": api_key}
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": f"Invalid Gemini API key: {result}"}), 401

@auth_bp.route('/gemini/disconnect', methods=['POST'])
def disconnect_gemini():
    CONNECTED_ACCOUNTS["gemini"] = None
    return jsonify({"success": True})

# Global Sign Out route
@auth_bp.route('/signout', methods=['POST'])
def global_signout():
    """Clears all connected accounts."""
    CONNECTED_ACCOUNTS["fireflies"] = None
    CONNECTED_ACCOUNTS["calendar"] = None
    CONNECTED_ACCOUNTS["gemini"] = None
    return jsonify({"success": True})
