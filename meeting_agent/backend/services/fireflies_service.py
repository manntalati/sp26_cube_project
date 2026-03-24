import requests

FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql"

def get_transcript_full(api_key, transcript_id, max_chars: int = 30000):
    """
    Fetches the full transcript text (from sentences) plus Fireflies action items.

    Returns (True, {"transcript_text": str, "action_items": list[str], "title": str | None})
    """
    query = """
    query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        id
        title
        sentences {
          index
          speaker_name
          text
        }
        summary {
          action_items
        }
      }
    }
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            FIREFLIES_GRAPHQL_URL,
            json={"query": query, "variables": {"transcriptId": transcript_id}},
            headers=headers,
            timeout=30,
        )
        data = response.json()
        if response.status_code != 200 or "data" not in data:
            return False, data.get("errors", [{"message": "Failed to fetch transcript details"}])

        transcript = (data.get("data") or {}).get("transcript") or {}
        sentences = transcript.get("sentences") or []
        title = transcript.get("title")
        action_items = ((transcript.get("summary") or {}).get("action_items")) or []

        # Build a plain text transcript. Keep it bounded to avoid overlong LLM prompts.
        lines = []
        for s in sorted(sentences, key=lambda x: (x.get("index") is None, x.get("index", 0))):
            speaker = (s.get("speaker_name") or "").strip()
            text = (s.get("text") or "").strip()
            if not text:
                continue
            if speaker:
                lines.append(f"{speaker}: {text}")
            else:
                lines.append(text)

        transcript_text = "\n".join(lines).strip()
        if max_chars and len(transcript_text) > max_chars:
            transcript_text = transcript_text[:max_chars] + "\n\n[TRUNCATED]"

        return True, {"transcript_text": transcript_text, "action_items": action_items, "title": title}
    except Exception as e:
        return False, str(e)

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
        
        user = (data.get("data") or {}).get("user")
        if response.status_code == 200 and "data" in data and user is not None:
            return True, user
        else:
            errors = data.get("errors", [{"message": "Invalid API Key or unauthorized"}])
            return False, errors[0]["message"] if errors else "Invalid API Key or unauthorized"
            
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
