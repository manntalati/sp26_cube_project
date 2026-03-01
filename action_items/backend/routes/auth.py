from flask import Blueprint, request, jsonify, session, redirect, url_for
from services.fireflies_service import validate_api_key
from services.calendar_service import get_google_auth_flow
import os
import json

auth_bp = Blueprint('auth', __name__)

# Basic in-memory store for connected accounts for this prototype.
# In a real app this would be a database based on a user ID.
CONNECTED_ACCOUNTS = {
    "fireflies": None,  # Will store {"email": "...", "name": "...", "api_key": "..."}
    "calendar": None    # Will store {"email": "...", "credentials": {...}}
}

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
@auth_bp.route('/google', methods=['GET'])
def auth_google():
    """Initiates the Google OAuth 2.0 flow."""
    flow = get_google_auth_flow()
    if not flow:
        return jsonify({"success": False, "error": "Google Client ID/Secret not configured in .env"}), 500
        
    # Generate URL for request to Google's OAuth 2.0 server.
    # Use kwargs to set optional request parameters.
    authorization_url, state = flow.authorization_url(
        # Enable offline access so that you can refresh an access token without
        # re-prompting the user for permission. Recommended for web server apps.
        access_type='offline',
        # Enable incremental authorization. Recommended as a best practice.
        include_granted_scopes='true')
    
    # Store the state so the callback can verify the auth server response.
    session['state'] = state
    
    # We return the URL rather than redirecting directly, because the frontend
    # might be making a fetch/xhr request rather than a direct navigation.
    return jsonify({"auth_url": authorization_url})


@auth_bp.route('/google/callback', methods=['GET'])
def auth_google_callback():
    """Handles the OAuth 2.0 server response."""
    state = session.get('state')
    
    flow = get_google_auth_flow()
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
