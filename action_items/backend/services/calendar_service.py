import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import datetime

# Scopes needed for Google Calendar
SCOPES = ['https://www.googleapis.com/auth/calendar.events']

def get_google_auth_flow():
    """
    Sets up the Google OAuth 2.0 flow using credentials from the environment.
    """
    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5000/api/auth/google/callback')
    
    if not client_id or not client_secret:
        return None

    # We manually construct the client_config dictionary instead of a file
    client_config = {
        "web": {
            "client_id": client_id,
            "project_id": "meeting-agent",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
            "redirect_uris": [redirect_uri]
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    return flow


def list_upcoming_events(credentials_dict, max_results=10):
    """
    Lists the next 10 events on the user's primary calendar.
    credentials_dict is expected to be a dict of the credentials (token, refresh_token, token_uri, client_id, client_secret, scopes)
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)

        # Call the Calendar API
        now = datetime.datetime.utcnow().isoformat() + 'Z'  # 'Z' indicates UTC time
        events_result = service.events().list(calendarId='primary', timeMin=now,
                                              maxResults=max_results, singleEvents=True,
                                              orderBy='startTime').execute()
        events = events_result.get('items', [])
        
        parsed_events = []
        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            parsed_events.append({
                'id': event.get('id'),
                'title': event.get('summary', 'Untitled Event'),
                'start': start,
                'link': event.get('htmlLink')
            })
            
        return True, parsed_events
    except Exception as e:
        return False, str(e)


def create_event(credentials_dict, summary, description, start_time_iso, end_time_iso):
    """
    Creates an event on the user's calendar.
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)
        
        event_body = {
            'summary': summary,
            'description': description,
            'start': {
                'dateTime': start_time_iso,
            },
            'end': {
                'dateTime': end_time_iso,
            },
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }

        event = service.events().insert(calendarId='primary', body=event_body).execute()
        return True, event.get('htmlLink')
    except Exception as e:
        return False, str(e)
