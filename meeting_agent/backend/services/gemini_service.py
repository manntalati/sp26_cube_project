import os
import json
from google import genai
from dotenv import load_dotenv
from routes.settings import load_participants

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
        client.models.get(model='gemini-2.5-flash')
        return True, "ok"
    except Exception as e:
        return False, str(e)


def generate_vc_emails(
    company_name: str,
    founder_name: str,
    vc_name: str,
    vc_firm: str,
    meeting_title: str,
    tldr: str,
    action_items: list[str],
    decision: str = None,
    reason: str = None,
    api_key: str = None,
) -> tuple[bool, any]:
    """
    Generates a continuation OR rejection follow-up email for a VC post-meeting.
    decision: 'pursue' | 'pass'
    reason: 1-3 sentence reason from the VC

    Returns (True, {"continuation": {"subject": str, "body": str},
                    "rejection":     {"subject": str, "body": str}})
         or (False, error_message_str)
    """
    try:
        client = _get_client(api_key=api_key)
    except ValueError as e:
        return False, str(e)

    action_items_block = (
        "\n".join(f"- {item}" for item in action_items)
        if action_items
        else "(none discussed)"
    )

    decision_instruction = ""
    if decision == "pursue":
        decision_instruction = "The VC has decided to PURSUE this company."
    elif decision == "pass":
        decision_instruction = "The VC has decided to PASS on this company."

    reason_instruction = f"The VC's stated reason: \"{reason}\"" if reason else "(no reason provided)"

    prompt = f"""You are a venture capitalist writing concise, professional post-meeting follow-up emails.

## Context
- Meeting title: {meeting_title}
- Startup: {company_name}
- Founder name: {founder_name}
- VC name (sender): {vc_name}
- VC firm: {vc_firm}
- Meeting summary (TL;DR): {tldr or "(not available)"}
- Key action items discussed:
{action_items_block}
- Decision: {decision_instruction}
- {reason_instruction}

## Your task
Write TWO emails in the VC's voice (even if a decision is provided, always return both):

1. **Continuation email** — The VC wants to move forward. Naturally incorporate the VC's stated reason if provided. Warm but professional. 3-5 short paragraphs.

2. **Rejection (pass) email** — The VC is passing. Naturally incorporate the VC's stated reason if provided. Be respectful and brief. 2-3 short paragraphs.

## Output format
Return ONLY a valid JSON object. No markdown fences, no extra text.
{{
  "continuation": {{
    "subject": "<email subject line>",
    "body": "<full email body, use \\n for line breaks>"
  }},
  "rejection": {{
    "subject": "<email subject line>",
    "body": "<full email body, use \\n for line breaks>"
  }}
}}
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

        result = json.loads(text)

        # Validate expected shape
        for key in ("continuation", "rejection"):
            if key not in result:
                raise ValueError(f"Missing '{key}' key in Gemini response")
            if "subject" not in result[key] or "body" not in result[key]:
                raise ValueError(f"Missing subject/body in '{key}' email")

        return True, result

    except json.JSONDecodeError as e:
        return False, f"Failed to parse Gemini response as JSON: {e}"
    except Exception as e:
        return False, str(e)


def analyze_action_items(transcript_text: str, raw_action_items: list[str], api_key: str = None) -> tuple[bool, any]:
    """
    Sends the meeting transcript and Fireflies-extracted action items to Gemini.

    Returns (True, list_of_enriched_items) on success, (False, error_message) on failure.

    Each item in the returned list is a dict with keys:
        id                - int index (1-based)
        description       - str  (original wording PRESERVED EXACTLY)
        description_flag  - str | null  (set ONLY if description is vague/unclear/not actionable)
        owner             - list[str] | []
        owner_flag        - str | null  (set if a name looks misspelled or incorrectly assigned)
        deadline          - str | null  (YYYY-MM-DD only)
        gap_notes         - list[str] | []  (each gap as a separate string, e.g. ["No owner found", "No deadline"])
        source            - "existing" | "suggested"
        priority          - "High" | "Medium" | "Low" | null
        task_status       - "Not Started" | "In Progress" | "Completed" | null
    """
    try:
        client = _get_client(api_key=api_key)
    except ValueError as e:
        return False, str(e)

    existing_block = "\n".join(
        f"{i+1}. {item}" for i, item in enumerate(raw_action_items)
    ) if raw_action_items else "(none)"

    all_participants_map = load_participants()
    all_participant_names = list({name for names in all_participants_map.values() for name in names})
    participant_instruction = ""
    if all_participant_names:
        participant_list = ", ".join(all_participant_names)
        participant_instruction = (
            f"\nIMPORTANT NAME CORRECTION RULES:\n"
            f"The following people are known meeting participants: {participant_list}\n"
            f"When you encounter any person name in the transcript or action items that appears to be\n"
            f"a misspelling, nickname, abbreviation, or variation of a name in this list,\n"
            f"replace it with the exact correct spelling from the list.\n"
            f"Examples: 'Sara' → 'Sarah Chen', 'Mike J' → 'Mike Johnson', 'Priya' → 'Priya Patel'.\n"
            f"Use case-insensitive fuzzy matching to make this determination.\n"
        )

    prompt = f"""You are an AI assistant that reviews meeting transcripts and action items.

## Your task
Given the meeting transcript and the list of action items already extracted by a transcription tool:
1. Enrich each existing action item by identifying:
   - The responsible owner(s) — a list of person names mentioned nearby (empty list [] if unclear)
   - A deadline — output ONLY as a YYYY-MM-DD date string or null. Do NOT include times. Convert relative phrases like "by Friday" to absolute dates based on context. If none, use null.
   - Gap notes — output as a JSON ARRAY of separate gap strings (e.g. ["No owner found", "No deadline mentioned"]). Empty array [] if no gaps.
2. Identify any completely new action items that were clearly discussed in the transcript but are MISSING from the existing action items list. For these new items, set "source": "suggested".
3. For existing items, PRESERVE the original wording of descriptions exactly. Do NOT alter the wording. Do NOT prepend verbs.
4. Set description_flag (non-null string) ONLY if the description is genuinely vague, unclear, or not actionable (e.g. "TBD", "discuss further"). Never flag just for missing a verb.
5. Set owner_flag (non-null string) if a name in owner looks misspelled or clearly incorrectly assigned. E.g. "'Jon' may be a misspelling of 'John'".
6. Analyze the entire meeting transcript and form 2-3 sentences based on what you think is the most important takeaway(s) from the meeting. Provide this summary in 5 different formality levels.
{participant_instruction}
## Output format
Return ONLY a valid JSON object. No markdown fences, no extra text. Format:
{{
  "tldr_0": "<2-3 sentence casual summary, like 'We wrapped up...'>",
  "tldr_1": "<2-3 sentence informal summary>",
  "tldr_2": "<2-3 sentence neutral summary>",
  "tldr_3": "<2-3 sentence professional summary>",
  "tldr_4": "<2-3 sentence formal summary>",
  "items": [
    {{
      "id": <int, 1-based>,
      "description": "<exact preserved description (or new text for suggested items)>",
      "description_flag": "<issue string or null>",
      "owner": ["<name>"],
      "owner_flag": "<issue string or null>",
      "deadline": "<YYYY-MM-DD or null>",
      "gap_notes": ["<gap string>", "<gap string>"],
      "source": "existing" | "suggested"
    }}
  ]
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

        parsed_data = json.loads(text)
        
        # Backwards compatibility / robustness
        if isinstance(parsed_data, list):
            items = parsed_data
            parsed_data = {
                "tldr_0": "Summary not available.",
                "tldr_1": "Summary not available.",
                "tldr_2": "Summary not available.",
                "tldr_3": "Summary not available.",
                "tldr_4": "Summary not available.",
                "items": items
            }
        elif not isinstance(parsed_data, dict) or "items" not in parsed_data:
            raise ValueError("Gemini did not return a valid JSON object containing 'items'")

        items = parsed_data["items"]
        
        # Normalise fields for robustness
        for item in items:
            # owner always a list
            raw_owner = item.get("owner")
            if raw_owner is None:
                item["owner"] = []
            elif isinstance(raw_owner, str):
                item["owner"] = [raw_owner] if raw_owner.strip() else []
            elif isinstance(raw_owner, list):
                item["owner"] = [o for o in raw_owner if o and str(o).strip()]
            else:
                item["owner"] = []

            # gap_notes always a list of strings
            raw_gaps = item.get("gap_notes")
            if raw_gaps is None:
                item["gap_notes"] = []
            elif isinstance(raw_gaps, str):
                # Handle old-format comma-separated string gracefully
                parts = [p.strip() for p in raw_gaps.split(",") if p.strip()]
                item["gap_notes"] = parts
            elif isinstance(raw_gaps, list):
                item["gap_notes"] = [str(g) for g in raw_gaps if g]
            else:
                item["gap_notes"] = []

        return True, parsed_data

    except json.JSONDecodeError as e:
        return False, f"Failed to parse Gemini response as JSON: {e}"
    except Exception as e:
        return False, str(e)
