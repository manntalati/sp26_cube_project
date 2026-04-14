import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import datetime

# Scopes needed for Google Calendar
SCOPES = ['https://www.googleapis.com/auth/calendar.events']


def get_google_auth_flow(client_id, client_secret):
    """
    Sets up the Google OAuth 2.0 flow using the provided client credentials.
    """
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:5002/api/auth/google/callback')

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
    flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)
    return flow


def list_upcoming_events(credentials_dict, max_results=20):
    """
    Lists upcoming meeting events (next 30 days) on the user's primary calendar.
    Filters to events that look like meetings: have multiple attendees or a video conference link.
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)

        now = datetime.datetime.utcnow()
        time_min = now.isoformat() + 'Z'
        time_max = (now + datetime.timedelta(days=30)).isoformat() + 'Z'

        events_result = service.events().list(
            calendarId='primary',
            timeMin=time_min,
            timeMax=time_max,
            maxResults=max_results,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        events = events_result.get('items', [])
        
        parsed_events = []
        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            end = event['end'].get('dateTime', event['end'].get('date'))

            attendees = event.get('attendees', [])
            # Count non-self attendees
            attendee_count = len([a for a in attendees if not a.get('self', False)])
            has_conference = bool(event.get('conferenceData') or event.get('hangoutLink'))

            # Only include events that look like meetings
            if attendee_count < 1 and not has_conference:
                continue

            parsed_events.append({
                'id': event.get('id'),
                'title': event.get('summary', 'Untitled Meeting'),
                'start': start,
                'end': end,
                'link': event.get('htmlLink'),
                'attendee_count': attendee_count,
            })
            
        return True, parsed_events
    except Exception as e:
        return False, str(e)


def create_event(credentials_dict, summary, description, start_time_iso, end_time_iso):
    """
    Creates an event on the user's calendar.
    start_time_iso / end_time_iso: ISO 8601 strings (datetime or date-only).
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)
        
        start_payload = {'date': start_time_iso} if len(start_time_iso) <= 10 else {'dateTime': start_time_iso, 'timeZone': 'UTC'}
        end_payload = {'date': end_time_iso} if len(end_time_iso) <= 10 else {'dateTime': end_time_iso, 'timeZone': 'UTC'}
        
        event_body = {
            'summary': summary,
            'description': description,
            'start': start_payload,
            'end': end_payload,
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }

        event = service.events().insert(calendarId='primary', body=event_body).execute()
        return True, {"link": event.get('htmlLink'), "id": event.get('id')}
    except Exception as e:
        return False, str(e)


def update_event(credentials_dict, event_id, summary, description, start_time_iso, end_time_iso):
    """
    Updates an existing event on the user's calendar.
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)
        
        start_payload = {'date': start_time_iso} if len(start_time_iso) <= 10 else {'dateTime': start_time_iso, 'timeZone': 'UTC'}
        end_payload = {'date': end_time_iso} if len(end_time_iso) <= 10 else {'dateTime': end_time_iso, 'timeZone': 'UTC'}
        
        event_body = {
            'summary': summary,
            'description': description,
            'start': start_payload,
            'end': end_payload,
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }

        event = service.events().update(calendarId='primary', eventId=event_id, body=event_body).execute()
        return True, {"link": event.get('htmlLink'), "id": event.get('id')}
    except Exception as e:
        return False, str(e)

def delete_event(credentials_dict, event_id):
    """
    Deletes an existing event from the user's calendar.
    """
    if not credentials_dict:
        return False, "No credentials provided"
        
    try:
        creds = Credentials(**credentials_dict)
        service = build('calendar', 'v3', credentials=creds)
        
        service.events().delete(calendarId='primary', eventId=event_id).execute()
        return True, "Deleted successfully"
    except Exception as e:
        return False, str(e)


