# Meeting Agent

An AI-powered desktop application that helps you capture, enrich, and organize action items from meetings — both recorded (via Fireflies.ai) and in-person (live microphone recording). Built with Electron + Flask + Google Gemini.

---

## Table of Contents

- [Features & Components](#features--components)
- [Getting Started](#getting-started)

---

## Features & Components

### Three-Phase Meeting Workflow

The Meeting Agent guides you through three distinct phases of a meeting:

#### Phase 1 — Pre-Meeting (Dashboard)
- View your upcoming Google Calendar events
- Choose between **Online mode** (Fireflies.ai transcripts) or **In-Person mode** (live microphone recording)
- Upload optional reference documents (PDF, TXT, MD) to give Gemini context during analysis
- Set up a participant roster for in-person meetings (maps speaker labels like "Speaker 0" to real names and emails)
- Select which meeting to analyze

#### Phase 2 — In-Meeting (Overlay)
- A compact **always-on-top overlay** (340×70px) that sits over your other windows
- Displays a live meeting agenda extracted from your meeting context
  - Mark agenda items as "covered" or "archived"
  - "Peek" mode to expand the full view without switching windows
  - Meeting duration timer
- **Nudges**: Context-aware prompts that surface decisions to make and open discussion topics
- **Live transcript** (in-person mode only): Real-time speaker-labeled transcript updated every second
- Keyboard shortcuts:
  - `` ` `` — Toggle agenda overlay visibility
  - `Escape` — Reset the keep-alive timer (prevent screen sleep during long meetings)
  - `Ctrl+,` — Toggle settings panel

#### Phase 3 — Post-Meeting (Action Items Review)
- Browse all AI-enriched action items from the meeting
- Filter by: **owner**, **priority** (High / Medium / Low), **task status** (Not Started / In Progress / Completed), and **deadline range**
- Sort by: ID, deadline, owner, priority, or status
- **Push to Calendar**: Create Google Calendar events directly from action item deadlines
- View **5-level TLDRs** summarizing the meeting from Casual to Formal
- See a "Grounded by Docs" indicator when document context influenced the analysis
- Expand/collapse data quality flags on individual action items

---

### Core Services

#### Gemini Service
Powered by **Google Gemini 2.5 Flash**, this is the brain of the application:
- Analyzes meeting transcripts and extracts/enriches action items
- Identifies owners, deadlines, priority levels, and data quality gaps for each item
- Suggests new action items that were implied but not explicitly captured by Fireflies
- Generates 5 formality-level meeting summaries (TLDRs)
- Supports **role-based analysis lenses**:
  - **Engineer** — focuses on technical decisions, blockers, implementation tasks
  - **Executive** — focuses on business decisions, escalations, timeline commitments
  - **VC** — focuses on market signals, team execution, fundraising milestones
  - **Sales** — focuses on customer pain points, buying signals, follow-up commitments
- Generates **VC follow-up emails** (both "pursue" and "pass" variants) after investor meetings

#### Fireflies Service
Integrates with **Fireflies.ai** to pull meeting transcripts and pre-extracted action items:
- Lists your recent transcripts with metadata (title, date, duration)
- Fetches full transcript text in speaker-labeled format
- Retrieves Fireflies' own pre-extracted action items as a baseline for Gemini enrichment
- Validates your API key on connection

#### Deepgram Service (In-Person Mode)
Provides **real-time audio transcription** for meetings happening in the room with you:
- Opens a WebSocket connection to Deepgram's Streaming API
- Uses the **Nova-2** model for high-accuracy transcription
- Automatically performs **speaker diarization** (detects multiple speakers, labels them Speaker 0, Speaker 1, etc.)
- Outputs final segments only (no flickering interim results)
- PCM-16 audio at 16kHz, 300ms endpointing for natural utterance detection
- Adapts output to the same format as Fireflies so the rest of the pipeline works identically

#### Background Analysis Service
Manages **async Gemini analysis jobs** so the UI stays responsive:
- Maintains a thread-safe job queue
- Tracks job states: `not_queued → queued → processing → ready | error`
- Two job types: **AnalysisJob** (Fireflies transcript → Gemini) and **InPersonJob** (live recording → Gemini)
- Injects relevant document context into Gemini prompts when documents have been uploaded

#### Document Service
Allows you to upload reference documents that Gemini uses as grounding context:
- Accepts **PDF, TXT, and MD** files
- Chunks documents (800-character chunks, 100-character overlap)
- Embeds each chunk using **Gemini text-embedding-004**
- At analysis time, performs **cosine similarity semantic search** (threshold: 0.45) to find the most relevant chunks
- Injects matched chunks into the Gemini prompt automatically

#### Calendar Service
Google Calendar integration for both viewing and creating events:
- Lists your upcoming calendar events (next 10)
- Creates calendar events from action item deadlines
- Adds 24-hour email reminders and 10-minute popup reminders automatically
- Handles timezone-aware and all-day events

---

### Electron Desktop App

#### Main Process (`main.js`)
- Manages the Flask backend process lifecycle — spawns it on launch, waits for a health check, and gracefully kills it on exit
- Creates and manages both the main window and the always-on-top overlay window
- Registers global keyboard shortcuts
- Handles IPC between the renderer and backend

#### Renderer (`renderer.js`)
- Orchestrates all UI state across the three meeting phases
- Handles in-person audio capture via `getUserMedia` + `ScriptProcessorNode`
- Streams PCM-16 audio chunks to the backend every 40ms during live recording
- Manages service connection UI and real-time polling for analysis status

#### Preload Script (`preload.js`)
- Secure IPC bridge between renderer and Electron main process

---

### Backend API Routes

| Route Group | Endpoints | Purpose |
|---|---|---|
| `/api/auth` | Fireflies, Google OAuth, Gemini, Deepgram | Connect and validate all external services |
| `/api/fireflies` | List transcripts, fetch action items | Pull meeting data from Fireflies.ai |
| `/api/gemini` | Status polling, enqueue, analyze, save, VC emails | Trigger and retrieve AI analysis |
| `/api/inperson` | Start/stop session, stream audio, poll transcript, analyze | Manage live recording sessions |
| `/api/documents` | Upload, list, delete, query | Manage reference document library |
| `/api/participants` | Get, save | Manage speaker-to-person mappings |
| `/api/calendar` | List events, create events | Google Calendar integration |
| `/api/demo` | Mock data | Demo mode without real API keys |

---

### Demo Mode
If no Fireflies API key is provided, the app enters **demo mode**:
- Pre-loads two mock transcripts: "Q3 Planning" and "Sprint Retrospective"
- Includes 6 sample action items with realistic data quality issues and flags
- Lets you explore filtering, sorting, TLDR levels, and action item review without any API keys

---

### Action Item Data Model
Each action item produced by Gemini looks like:

```json
{
  "id": 1,
  "description": "Schedule follow-up with design team before next sprint",
  "description_flag": null,
  "owner": ["Alice Smith"],
  "owner_flag": null,
  "deadline": "2026-04-21",
  "gap_notes": ["No priority set"],
  "source": "suggested",
  "priority": "High",
  "task_status": "Not Started"
}
```

---

### Key Technologies

| Layer | Technology | Role |
|---|---|---|
| Desktop shell | Electron 40.8.3 | Native app, window management, global shortcuts |
| Backend | Flask (Python) | REST API, service orchestration |
| LLM | Google Gemini 2.5 Flash | Action item enrichment, summarization, email generation |
| Embeddings | Gemini text-embedding-004 | Document semantic search |
| Transcription (online) | Fireflies.ai GraphQL API | Cloud meeting transcript ingestion |
| Transcription (in-person) | Deepgram Nova-2 WebSocket | Real-time microphone transcription + diarization |
| Calendar | Google Calendar API v3 | Event listing and creation |
| Auth | Google OAuth 2.0 | Calendar access |
| PDF parsing | pypdf | Reference document ingestion |
| Embeddings math | numpy | Cosine similarity for document search |

---

---

## Getting Started

This section walks you through setting up the Meeting Agent from scratch on your machine.

### Prerequisites

Make sure you have the following installed:

- **Node.js** (v18 or later) — [nodejs.org](https://nodejs.org)
- **Python 3.10 or later** — [python.org](https://python.org)
- **pip** (comes with Python)
- A terminal (macOS Terminal, iTerm2, etc.)

---

### Step 1 — Clone the Repository

```bash
git clone <your-repo-url>
cd sp26_cube_project/meeting_agent
```

---

### Step 2 — Install Python Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

This installs Flask, Google Gemini SDK, Deepgram WebSocket client, pypdf, numpy, and all other backend dependencies.

---

### Step 3 — Install Node / Electron Dependencies

From the `meeting_agent` directory:

```bash
npm install
```

---

### Step 4 — Obtain Your API Keys

The Meeting Agent connects to several external services. You will set these up inside the app itself (not in a config file), but you need to obtain the keys first.

#### Required (core functionality)
- **Google Gemini API Key**
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
  2. Click "Create API key"
  3. Copy the key — you will paste it into the app

#### Required for Online Mode (Fireflies transcripts)
- **Fireflies.ai API Key**
  1. Log in to [app.fireflies.ai](https://app.fireflies.ai)
  2. Go to Settings → API
  3. Copy your API key

#### Required for In-Person Mode (live recording)
- **Deepgram API Key**
  1. Sign up at [deepgram.com](https://deepgram.com)
  2. Go to your dashboard → API Keys → Create a new key
  3. Copy the key

#### Required for Calendar Integration
- **Google Calendar (OAuth)**
  1. Go to the [Google Cloud Console](https://console.cloud.google.com) and create a project
  2. Enable the **Google Calendar API** for that project
  3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
  4. Choose **Web application**, and add `http://localhost:5002/api/auth/google/callback` as an authorized redirect URI
  5. Download or copy the Client ID and Client Secret
  6. In `meeting_agent/backend/`, copy `client_secrets.json.example` to `client_secrets.json` and fill in your Client ID and Client Secret — **this is a one-time setup step**
  7. Inside the app, just click "Connect with Google" — no credentials entry in the UI

---

### Step 5 — Launch the App

From the `meeting_agent` directory:

```bash
npm start
```

This will:
1. Start the Electron app
2. Automatically launch the Flask backend in the background
3. Wait for the backend health check to pass
4. Open the main application window

---

### Step 6 — Connect Your Services

When the app opens, you will see the **Dashboard** with connection cards for each service. Connect them in this order:

#### 1. Connect Gemini (required for all modes)
- Click the Gemini card
- Paste your Gemini API key
- Click "Connect" — the app will validate the key

#### 2. Connect Fireflies (for Online Mode)
- Click the Fireflies card
- Paste your Fireflies API key
- Click "Connect"
- Your recent transcripts will appear in the dashboard once connected

#### 3. Connect Google Calendar (optional but recommended)
- Ensure you have completed the `client_secrets.json` one-time setup (see Step 4 above)
- Click "Connect with Google" — a browser window will open for Google authorization
- Complete the OAuth flow and return to the app
- Upcoming events will appear in the dashboard

#### 4. Connect Deepgram (for In-Person Mode only)
- Click the Deepgram card
- Paste your Deepgram API key
- Click "Connect"

---

### Step 7 — Choose Your Meeting Mode

On the dashboard, select how you want to capture your meeting:

**Online Mode** — Use this if your meeting is recorded in Fireflies.ai
- Your Fireflies transcripts will be listed
- Click a transcript to queue it for analysis
- Gemini will enrich the action items in the background

**In-Person Mode** — Use this if you are physically in a meeting room
- Set up your participant roster: map "Speaker 0", "Speaker 1", etc. to real names and emails
- Click "Start Recording" when the meeting begins
- The app uses your microphone to transcribe in real time via Deepgram
- Click "Stop Recording" when done, then trigger Gemini analysis

---

### Step 8 — (Optional) Upload Reference Documents

Before starting analysis, you can upload documents that will give Gemini grounding context:
- Click "Upload Document" in the dashboard
- Supported formats: PDF, TXT, MD
- The app will chunk and embed the document automatically
- During analysis, relevant sections will be injected into the Gemini prompt
- Action items influenced by document context will show a "Grounded by Docs" badge

---

### Step 9 — Review Action Items

After analysis completes, you will be taken to the **Action Items Review** screen:

- Browse all extracted and suggested action items
- Use filters (owner, priority, status, deadline) to focus on what matters to you
- Select a **role lens** (Engineer / Executive / VC / Sales) to see role-specific perspective
- Read the **TLDR summaries** (5 formality levels) for a quick meeting recap
- Click "Push to Calendar" on any action item to create a Google Calendar event for its deadline
- Edit owners, deadlines, and descriptions directly — changes are saved back to the backend

---

### Step 10 — Try Demo Mode (No API Keys Required)

If you want to explore the app before setting up any API keys:
- Open the app without connecting Fireflies
- The app will automatically enter Demo Mode
- Two pre-loaded mock meetings ("Q3 Planning", "Sprint Retrospective") will appear
- All filtering, sorting, TLDR, and review features are fully functional in demo mode

---

### Troubleshooting

**App opens but shows a blank screen**
- The Flask backend may have failed to start. Check your terminal output for Python errors.
- Make sure all backend dependencies are installed: `pip install -r backend/requirements.txt`

**"Invalid API key" error on connect**
- Double-check you copied the full key with no leading/trailing spaces
- For Gemini, ensure your key has access to the `gemini-2.5-flash` model in AI Studio

**Microphone not working in In-Person mode**
- Make sure you granted microphone permission to Electron when prompted
- On macOS: System Settings → Privacy & Security → Microphone → enable for Electron

**Google Calendar OAuth fails**
- Ensure you are using a standard Google account (not a Workspace account with restrictions)
- Try disconnecting and reconnecting via the Calendar card

**Deepgram transcription stops mid-meeting**
- Check your Deepgram account has sufficient credits
- Verify your internet connection is stable — Deepgram requires a persistent WebSocket

---

### Project Structure (Meeting Agent)

```
meeting_agent/
├── main.js                  # Electron main process
├── preload.js               # Secure IPC bridge
├── renderer.js              # UI logic and phase orchestration
├── index.html               # App shell
├── api.js                   # Frontend API client
├── package.json
└── backend/
    ├── app.py               # Flask app entrypoint
    ├── requirements.txt
    ├── routes/
    │   ├── auth.py          # Service authentication
    │   ├── fireflies.py     # Transcript fetching
    │   ├── gemini.py        # AI analysis endpoints
    │   ├── inperson.py      # Live recording session
    │   ├── documents.py     # Document upload & search
    │   ├── participants.py  # Speaker roster
    │   └── calendar.py      # Google Calendar
    ├── services/
    │   ├── gemini_service.py          # Gemini LLM integration
    │   ├── fireflies_service.py       # Fireflies GraphQL client
    │   ├── deepgram_service.py        # Real-time audio transcription
    │   ├── background_analysis.py     # Async job queue
    │   ├── document_service.py        # Document embedding & search
    │   └── calendar_service.py        # Google Calendar OAuth
    └── data/
        └── participants.json          # Persisted participant roster
```
