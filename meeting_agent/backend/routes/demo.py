"""
Demo mode routes — populates the backend with realistic mock data
so the Meeting Agent can be showcased without real API keys.
"""
from flask import Blueprint, jsonify
from routes.auth import CONNECTED_ACCOUNTS
from services.background_analysis import ANALYSIS_STORE
from routes.settings import save_participants
import time

demo_bp = Blueprint('demo', __name__)

# ── Mock data ─────────────────────────────────────────────────────────────────

DEMO_TRANSCRIPTS = [
    {
        "id": "demo_q3_planning",
        "title": "Q3 Planning & Resource Allocation",
        "date": str(int(time.time() * 1000)),  # "now" in epoch ms
        "duration": 2520,  # 42 minutes
        "organizer_email": "sarah.chen@acme.com",
    },
    {
        "id": "demo_sprint_retro",
        "title": "Sprint 14 Retrospective",
        "date": str(int((time.time() - 86400) * 1000)),  # yesterday
        "duration": 1800,  # 30 minutes
        "organizer_email": "mike.johnson@acme.com",
    },
]

DEMO_ACTION_ITEMS_Q3 = [
    {
        "id": 1,
        "description": "Draft the Q3 budget proposal with updated headcount projections",
        "description_flag": None,
        "owner": ["Sarah Chen"],
        "owner_flag": None,
        "deadline": "2026-04-07",
        "priority": "High",
        "task_status": "Not Started",
        "status": "pending",
        "source": "existing",
        "gap_notes": [],
    },
    {
        "id": 2,
        "description": "Evaluate three vendor proposals for the new analytics platform",
        "description_flag": "Vague — which vendors? Clarify with procurement.",
        "owner": ["Mike Johnson", "Priya Patel"],
        "owner_flag": None,
        "deadline": "2026-04-14",
        "priority": "High",
        "task_status": "Not Started",
        "status": "pending",
        "source": "existing",
        "gap_notes": ["Missing: vendor shortlist not attached"],
    },
    {
        "id": 3,
        "description": "Schedule one-on-ones with each team lead to discuss Q3 OKRs",
        "description_flag": None,
        "owner": ["Sarah Chen"],
        "owner_flag": None,
        "deadline": "2026-04-04",
        "priority": "Medium",
        "task_status": "Not Started",
        "status": "pending",
        "source": "existing",
        "gap_notes": [],
    },
    {
        "id": 4,
        "description": "Migrate staging environment to the new Kubernetes cluster before feature freeze",
        "description_flag": None,
        "owner": ["DevOps Team"],
        "owner_flag": "Owner is a team, not a person — assign a DRI",
        "deadline": "2026-04-21",
        "priority": "High",
        "task_status": "In Progress",
        "status": "pending",
        "source": "existing",
        "gap_notes": [],
    },
    {
        "id": 5,
        "description": "Create customer interview script for the new onboarding flow research",
        "description_flag": None,
        "owner": ["Alex Rivera"],
        "owner_flag": None,
        "deadline": None,
        "priority": "Medium",
        "task_status": "Not Started",
        "status": "pending",
        "source": "suggested",
        "gap_notes": ["Missing deadline — was discussed but no date committed"],
    },
    {
        "id": 6,
        "description": "Send updated project timeline to stakeholders by EOD Friday",
        "description_flag": None,
        "owner": ["Priya Patel"],
        "owner_flag": None,
        "deadline": "2026-03-28",
        "priority": "Low",
        "task_status": "Not Started",
        "status": "pending",
        "source": "suggested",
        "gap_notes": [],
    },
]

DEMO_ACTION_ITEMS_RETRO = [
    {
        "id": 1,
        "description": "Set up automated flaky-test detection in CI pipeline",
        "description_flag": None,
        "owner": ["Jordan Lee"],
        "owner_flag": None,
        "deadline": "2026-04-11",
        "priority": "High",
        "task_status": "Not Started",
        "status": "pending",
        "source": "existing",
        "gap_notes": [],
    },
    {
        "id": 2,
        "description": "Write post-mortem for the payments outage on March 18",
        "description_flag": None,
        "owner": ["Mike Johnson"],
        "owner_flag": None,
        "deadline": "2026-03-31",
        "priority": "Medium",
        "task_status": "In Progress",
        "status": "pending",
        "source": "existing",
        "gap_notes": [],
    },
    {
        "id": 3,
        "description": "Reduce PR review turnaround to under 24 hours",
        "description_flag": "This is a goal, not an actionable task — break into specific steps",
        "owner": [],
        "owner_flag": "No owner assigned",
        "deadline": None,
        "priority": "Medium",
        "task_status": "Not Started",
        "status": "pending",
        "source": "suggested",
        "gap_notes": ["No owner", "No deadline", "Needs concrete next steps"],
    },
]

DEMO_CALENDAR_EVENTS = [
    {"id": "demo_ev_q3",       "title": "Q3 Planning & Resource Allocation", "start": "2026-04-14T10:00:00", "end": "2026-04-14T11:00:00", "link": "#", "attendee_count": 6},
    {"id": "demo_ev_1on1",     "title": "1:1 with Priya Patel",               "start": "2026-04-15T14:00:00", "end": "2026-04-15T14:30:00", "link": "#", "attendee_count": 2},
    {"id": "demo_ev_sprint15", "title": "Sprint 15 Kickoff",                  "start": "2026-04-16T09:30:00", "end": "2026-04-16T10:00:00", "link": "#", "attendee_count": 8},
    {"id": "demo_ev_design",   "title": "Design Review: Onboarding V2",       "start": "2026-04-17T15:00:00", "end": "2026-04-17T16:00:00", "link": "#", "attendee_count": 4},
    {"id": "demo_ev_allhands", "title": "All-Hands",                           "start": "2026-04-18T11:00:00", "end": "2026-04-18T12:00:00", "link": "#", "attendee_count": 25},
]

DEMO_PARTICIPANTS = {
    "demo_ev_q3":       ["Sarah Chen", "Mike Johnson", "Priya Patel", "Alex Rivera", "Jordan Lee", "Sam Park"],
    "demo_ev_1on1":     ["Sarah Chen", "Priya Patel"],
    "demo_ev_sprint15": ["Jordan Lee", "Mike Johnson", "Priya Patel", "Alex Rivera"],
    "demo_ev_design":   ["Alex Rivera", "Priya Patel", "Jordan Lee", "Sam Park"],
    "demo_ev_allhands": ["Sarah Chen", "Mike Johnson", "Priya Patel", "Alex Rivera", "Jordan Lee"],
}

# ── State flag ────────────────────────────────────────────────────────────────
_demo_active = False


def is_demo_active():
    return _demo_active


@demo_bp.route('/enable', methods=['POST'])
def enable_demo():
    """Activate demo mode — populates all stores with mock data."""
    global _demo_active
    _demo_active = True

    # 1. Set connected accounts
    CONNECTED_ACCOUNTS["fireflies"] = {
        "api_key": "demo_key",
        "email": "sarah.chen@acme.com",
        "name": "Sarah Chen",
    }
    CONNECTED_ACCOUNTS["calendar"] = {
        "email": "sarah.chen@acme.com",
        "credentials": {"token": "demo"},
    }
    CONNECTED_ACCOUNTS["gemini"] = {
        "api_key": "demo_key",
    }

    # 2. Populate analysis store with ready results (includes TL;DRs at all formality levels)
    ANALYSIS_STORE["demo_q3_planning"] = {
        "transcript_id": "demo_q3_planning",
        "status": "ready",
        "items": DEMO_ACTION_ITEMS_Q3,
        "error": None,
        "updated_at_ms": int(time.time() * 1000),
        "grounded_by_docs": True,
        "tldrs": {
            "tldr_0": "Quick recap: 42-min Q3 planning sync. We locked in 6 action items and hit 3 of 5 agenda topics — 2 things still need follow-up.",
            "tldr_1": "Here's the gist: The team met ~42 min for Q3 planning. Six action items came out of it, covering budgets, vendor eval, and the staging migration. Two agenda topics are still open.",
            "tldr_2": "This Q3 planning session (approx. 42 min) produced 6 action items spanning budget, vendor evaluation, and infrastructure. Three of five agenda topics were addressed; two remain open.",
            "tldr_3": "Executive Summary: The Q3 planning session (approx. 42 minutes) produced 6 action items aligned with revenue targets and product milestones. Three of five agenda topics received substantive discussion; two require further resolution.",
            "tldr_4": "Meeting Synopsis: The convened Q3 planning session (approximately 42 minutes) concluded with 6 formally identified action items spanning budgetary, procurement, and infrastructure domains. Three of five agenda points received substantive discussion; two matters remain unresolved and necessitate subsequent follow-up.",
        },
    }
    ANALYSIS_STORE["demo_sprint_retro"] = {
        "transcript_id": "demo_sprint_retro",
        "status": "ready",
        "items": DEMO_ACTION_ITEMS_RETRO,
        "error": None,
        "updated_at_ms": int(time.time() * 1000),
        "grounded_by_docs": False,
        "tldrs": {
            "tldr_0": "Quick recap: 30-min sprint retro. Three action items came out — CI improvements, a post-mortem, and a PR review process overhaul.",
            "tldr_1": "Here's the gist: Sprint 14 retro ran 30 min. The team flagged flaky tests, the payments outage post-mortem, and slow PR reviews as the main takeaways.",
            "tldr_2": "Sprint 14 retrospective (30 min) produced 3 action items: automated flaky-test detection, a payments outage post-mortem, and a PR review turnaround improvement.",
            "tldr_3": "Executive Summary: The Sprint 14 retrospective (30 minutes) identified 3 action items focused on CI reliability, incident documentation, and code review velocity.",
            "tldr_4": "Meeting Synopsis: The Sprint 14 retrospective (approximately 30 minutes) concluded with 3 formally identified action items addressing CI pipeline reliability, post-incident documentation, and pull request review process improvements.",
        },
    }

    # 3. Seed participants
    save_participants(DEMO_PARTICIPANTS)

    return jsonify({"success": True, "message": "Demo mode enabled"})


@demo_bp.route('/disable', methods=['POST'])
def disable_demo():
    """Deactivate demo mode — clears all mock data."""
    global _demo_active
    _demo_active = False

    CONNECTED_ACCOUNTS["fireflies"] = None
    CONNECTED_ACCOUNTS["calendar"] = None
    CONNECTED_ACCOUNTS["gemini"] = None
    ANALYSIS_STORE.pop("demo_q3_planning", None)
    ANALYSIS_STORE.pop("demo_sprint_retro", None)

    return jsonify({"success": True, "message": "Demo mode disabled"})


@demo_bp.route('/transcripts', methods=['GET'])
def get_demo_transcripts():
    """Return mock transcripts (used by fireflies route override)."""
    return jsonify({"success": True, "transcripts": DEMO_TRANSCRIPTS})


@demo_bp.route('/events', methods=['GET'])
def get_demo_events():
    """Return mock calendar events."""
    return jsonify({"success": True, "events": DEMO_CALENDAR_EVENTS})


@demo_bp.route('/status', methods=['GET'])
def get_demo_status():
    """Return whether demo mode is active."""
    return jsonify({"demo": _demo_active})
