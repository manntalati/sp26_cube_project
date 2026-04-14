// ─────────────────────────────────────────────────────────────────────────────
// HTTP CLIENT — wraps all Flask backend calls
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:5002';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

/**
 * Post raw binary audio data (PCM-16) to the in-person audio endpoint.
 * Fire-and-forget: the caller does not await the response — this keeps
 * the ScriptProcessorNode's onaudioprocess handler non-blocking.
 */
async function apiPostBinary(path, arrayBuffer) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: arrayBuffer,
  });
  // 204 No Content is the success response for /audio
  if (res.status === 204) return { success: true };
  return res.json().catch(() => ({ success: false }));
}

async function apiPut(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────
const API = {
  // Health
  health: () => apiGet('/api/health'),

  // Auth
  getAuthStatus: () => apiGet('/api/auth/status'),
  connectFireflies: (apiKey) => apiPost('/api/auth/fireflies', { api_key: apiKey }),
  disconnectFireflies: () => apiPost('/api/auth/fireflies/disconnect'),
  connectGoogle: (clientId, clientSecret) => apiPost('/api/auth/google', { client_id: clientId, client_secret: clientSecret }),
  disconnectCalendar: () => apiPost('/api/auth/calendar/disconnect'),
  connectGemini: (apiKey) => apiPost('/api/auth/gemini', { api_key: apiKey }),
  disconnectGemini: () => apiPost('/api/auth/gemini/disconnect'),
  signOut: () => apiPost('/api/auth/signout'),

  // Fireflies
  getTranscripts: () => apiGet('/api/fireflies/transcripts'),

  // Calendar
  getCalendarEvents: () => apiGet('/api/calendar/events'),
  createCalendarEvent: (data) => apiPost('/api/calendar/events', data),
  updateCalendarEvent: (eventId, data) => apiPut(`/api/calendar/events/${eventId}`, data),
  deleteCalendarEvent: (eventId) => apiDelete(`/api/calendar/events/${eventId}`),

  // Gemini Analysis
  getAnalysisStatus: (transcriptId) => apiGet(`/api/gemini/status/${transcriptId}`),
  enqueueAnalysis: (transcriptId, force = false) => apiPost('/api/gemini/enqueue', { transcript_id: transcriptId, force }),
  saveAnalysis: (transcriptId, items) => apiPost('/api/gemini/save', { transcript_id: transcriptId, items }),

  // Settings
  getAliases: () => apiGet('/api/settings/aliases'),
  saveAliases: (aliases) => apiPost('/api/settings/aliases', { aliases }),

  // Demo
  enableDemo: () => apiPost('/api/demo/enable'),
  disableDemo: () => apiPost('/api/demo/disable'),
  getDemoStatus: () => apiGet('/api/demo/status'),

  // ── Participants (in-person mode) ──────────────────────────────────────────
  getParticipants: () => apiGet('/api/participants'),
  saveParticipants: (participants) => apiPost('/api/participants', { participants }),

  // ── Auth: Deepgram (in-person mode) ────────────────────────────────────────
  connectDeepgram: (apiKey) => apiPost('/api/auth/deepgram', { api_key: apiKey }),
  disconnectDeepgram: () => apiPost('/api/auth/deepgram/disconnect'),

  // ── In-Person Notetaker Mode ───────────────────────────────────────────────

  /**
   * Create a Deepgram session and open the WebSocket.
   * sampleRate should match the AudioContext.sampleRate used in the renderer.
   */
  startInPersonSession: (sessionId, sampleRate = 16000) =>
    apiPost('/api/inperson/start', { session_id: sessionId, sample_rate: sampleRate }),

  /**
   * Forward a raw PCM-16 ArrayBuffer to the active Deepgram session.
   * Called ~4×/second from the ScriptProcessorNode; must be fast.
   */
  sendAudio: (sessionId, arrayBuffer) =>
    apiPostBinary(`/api/inperson/audio?session_id=${encodeURIComponent(sessionId)}`, arrayBuffer),

  /** Signal end-of-stream; Deepgram will flush remaining audio. */
  stopInPersonSession: (sessionId) =>
    apiPost('/api/inperson/stop', { session_id: sessionId }),

  /** Poll for live transcript segments (called every ~1 s during recording). */
  getInPersonTranscript: (sessionId) =>
    apiGet(`/api/inperson/transcript?session_id=${encodeURIComponent(sessionId)}`),

  /** After recording stops: enqueue Gemini analysis (uses existing ANALYSIS_STORE). */
  analyzeInPersonSession: (sessionId) =>
    apiPost('/api/inperson/analyze', { session_id: sessionId }),
};
