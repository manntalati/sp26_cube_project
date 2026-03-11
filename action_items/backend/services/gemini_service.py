import os
import json
from google import genai
from dotenv import load_dotenv

# Try to load from root directory, fallback to current dir
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

def _get_client(api_key: str = None):
    api_key = api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set in environment")
    return genai.Client(api_key=api_key)


def validate_gemini_key(api_key: str) -> tuple[bool, str]:
    """
    Validates a Gemini API key by making a lightweight list-models call.
    Returns (True, "ok") on success, (False, error_message) on failure.
    """
    try:
        client = genai.Client(api_key=api_key)
        # A lightweight call to verify the key works
        client.models.get(model='gemini-2.5-flash')
        return True, "ok"
    except Exception as e:
        return False, str(e)


def analyze_action_items(transcript_text: str, raw_action_items: list[str], api_key: str = None) -> tuple[bool, any]:
    """
    Sends the meeting transcript and Fireflies-extracted action items to Gemini.

    Returns (True, list_of_enriched_items) on success, (False, error_message) on failure.

    Each item in the returned list is a dict with keys:
        id           - int index (1-based)
        description  - str
        owner        - str | null  (suggested person responsible)
        deadline     - str | null  (e.g. "2026-03-15" or a relative phrase)
        gap_notes    - str | null  (e.g. "No owner identified", "Deadline missing")
        source       - "existing" | "suggested"
        priority     - "High" | "Medium" | "Low" | null
        task_status  - "Not Started" | "In Progress" | "Completed" | null
    """
    try:
        client = _get_client(api_key=api_key)
    except ValueError as e:

        return False, str(e)

    existing_block = "\n".join(
        f"{i+1}. {item}" for i, item in enumerate(raw_action_items)
    ) if raw_action_items else "(none)"

    prompt = f"""You are an AI assistant that reviews meeting transcripts and action items.

## Your task
Given the meeting transcript and the list of action items already extracted by a transcription tool:
1. Enrich each existing action item by identifying:
   - The responsible owner (person's name mentioned nearby, or null if unclear)
   - A deadline (explicit date, relative phrase like "by Friday", or null if none mentioned)
   - Gap notes flagging what is missing (e.g. "No owner found", "No deadline mentioned")
2. Identify any additional action items that were clearly discussed but NOT yet in the list.

## Output format
Return ONLY a valid JSON array. No markdown fences, no extra text. Each element:
{{
  "id": <int, 1-based>,
  "description": "<clear, concise action item>",
  "owner": "<name or null>",
  "deadline": "<date/phrase or null>",
  "gap_notes": "<string describing gaps, or null if none>",
  "source": "existing" | "suggested"
}}

## Existing action items
{existing_block}

## Meeting transcript
{transcript_text if transcript_text else "(No transcript text available — use action items only)"}
"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        text = response.text.strip()

        # Strip accidental markdown fences if present
        if text.startswith("```"):
            lines = text.splitlines()
            text = "\n".join(
                line for line in lines
                if not line.startswith("```")
            ).strip()

        items = json.loads(text)
        if not isinstance(items, list):
            raise ValueError("Gemini did not return a JSON array")

        return True, items

    except json.JSONDecodeError as e:
        return False, f"Failed to parse Gemini response as JSON: {e}"
    except Exception as e:
        return False, str(e)
