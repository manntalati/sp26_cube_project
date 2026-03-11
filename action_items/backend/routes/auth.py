from flask import Blueprint, request, jsonify, session, redirect, url_for
from services.fireflies_service import validate_api_key
from services.calendar_service import get_google_auth_flow
from services.gemini_service import validate_gemini_key
import os
import json

auth_bp = Blueprint('auth', __name__)

# Basic in-memory store for connected accounts for this prototype.
# In a real app this would be a database based on a user ID.
CONNECTED_ACCOUNTS = {
    "fireflies": None,  # Will store {"email": "...", "name": "...", "api_key": "..."}
    "calendar": None,   # Will store {"email": "...", "credentials": {...}}
    "gemini": None       # Will store {"api_key": "..."}
}

# In-memory store for pending OAuth flows, keyed by the state parameter.
# This avoids relying on Flask sessions, which break when the Vite proxy
# sets the cookie on port 5173 but Google redirects directly to port 5002.
PENDING_OAUTH_FLOWS = {}

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
    
    # Store credentials keyed by the OAuth state param so the callback
    # can retrieve them without depending on session cookies.
    PENDING_OAUTH_FLOWS[state] = {
        'client_id': client_id,
        'client_secret': client_secret
    }
    
    return jsonify({"auth_url": authorization_url})


@auth_bp.route('/google/callback', methods=['GET'])
def auth_google_callback():
    """Handles the OAuth 2.0 server response."""
    state = request.args.get('state')
    
    # Look up the credentials saved during the initial /google POST
    pending = PENDING_OAUTH_FLOWS.pop(state, None)
    if not pending:
        return "OAuth state not found. Please try connecting again.", 400
    
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

    # Redirect back to the frontend app connecting calendar page
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    return redirect(f"{frontend_url}/connect/calendar?success=true")

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
