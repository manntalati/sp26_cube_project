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
  getParticipants: () => apiGet('/api/settings/participants'),
  saveParticipants: (participants) => apiPost('/api/settings/participants', { participants }),

  // Demo
  enableDemo: () => apiPost('/api/demo/enable'),
  disableDemo: () => apiPost('/api/demo/disable'),
  getDemoStatus: () => apiGet('/api/demo/status'),

  // VC Follow-Up Email Generator
  generateVCEmails: (transcriptId, context) => apiPost('/api/gemini/vc_emails', { transcript_id: transcriptId, ...context }),
};