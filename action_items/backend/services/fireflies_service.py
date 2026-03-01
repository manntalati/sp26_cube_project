import requests

FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql"

def validate_api_key(api_key):
    """
    Validates the Fireflies API key by fetching the user's profile.
    """
    query = """
    query {
        user {
            email
            name
        }
    }
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            FIREFLIES_GRAPHQL_URL,
            json={"query": query},
            headers=headers
        )
        
        data = response.json()
        
        if response.status_code == 200 and "data" in data and "user" in data["data"]:
            return True, data["data"]["user"]
        else:
            errors = data.get("errors", [{"message": "Invalid API Key or unauthorized"}])
            return False, errors[0]["message"]
            
    except Exception as e:
        return False, str(e)


def get_transcripts(api_key, limit=10):
    """
    Fetches recent transcripts summary.
    """
    query = """
    query GetTranscripts($limit: Int) {
        transcripts(limit: $limit) {
            id
            title
            date
            duration
        }
    }
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            FIREFLIES_GRAPHQL_URL,
            json={"query": query, "variables": {"limit": limit}},
            headers=headers
        )
        data = response.json()
        if response.status_code == 200 and "data" in data:
            return True, data["data"]["transcripts"]
        return False, data.get("errors", [{"message": "Failed to fetch transcripts"}])
    except Exception as e:
        return False, str(e)


def get_transcript_action_items(api_key, transcript_id):
    """
    Fetches specific transcript action items.
    """
    query = """
    query GetTranscript($id: String!) {
        transcript(id: $id) {
            id
            title
            summary {
                action_items
            }
        }
    }
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            FIREFLIES_GRAPHQL_URL,
            json={"query": query, "variables": {"id": transcript_id}},
            headers=headers
        )
        data = response.json()
        if response.status_code == 200 and "data" in data:
            transcript = data["data"]["transcript"]
            if transcript and "summary" in transcript and "action_items" in transcript["summary"]:
                return True, transcript["summary"]["action_items"]
            return True, [] # No action items
        return False, data.get("errors", [{"message": "Failed to fetch transcript details"}])
    except Exception as e:
        return False, str(e)
