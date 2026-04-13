// ═══════════════════════════════════════════════════════════════════════════════
// MEETING AGENT — Renderer (Three-Phase Architecture)
// Phase 1: Pre-Meeting  — Dashboard, setup, connections, upcoming events
// Phase 2: In-Meeting   — Overlay with agenda questions, nudges, timer
// Phase 3: Post-Meeting — Action items review, meeting summary, calendar push
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentPhase = 'pre'; // 'pre' | 'in' | 'post'

// Agenda (in-meeting)
let agendaData = [];
let isPeekMode = false;
let escPressTimer = null;
let globalEscKeepAlive = null;
let isEscDown = false;
let meetingStartEpochMs = null;
let meetingActive = false;

// Nudge
let currentNudge = null;

// Backend
let connections = { fireflies: null, calendar: null, gemini: null };
let transcripts = [];
let analysisById = {};
let calendarEvents = [];
let selectedTranscriptId = null;
let actionItems = [];
let activeActionTab = 'pending';
let filterConfigs = { category: 'none', values: [], dateStart: '', dateEnd: '' };
let sortConfigs = { category: 'none', dir: 'asc' };
let meetingParticipants = {}; // { eventId: ['Name', ...] }
let expandedMeetingId = null;

let analysisPollingInterval = null;

// ─────────────────────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const appContainer = $('app-container');
const headerBadge = $('headerBadge');
const headerTime = $('headerTime');
const statusDot = $('statusDot');
const statusLabel = $('statusLabel');
const phaseNav = $('phaseNav');

const phasePreContent = $('phasePreContent');
const phaseInContent = $('phaseInContent');
const phasePostContent = $('phasePostContent');

const nudgePanel = $('nudgePanel');
const nudgeReason = $('nudgeReason');
const nudgeText = $('nudgeText');

// ─────────────────────────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────────────────────────
function requestResize() {
  setTimeout(() => {
    const rect = appContainer.getBoundingClientRect();
    window.electronAPI.resizeWindow(rect.width, rect.height);
  }, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
$('phaseNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.phase-btn');
  if (!btn) return;
  switchPhase(btn.dataset.phase);
});

function switchPhase(phase) {
  currentPhase = phase;

  // Update nav buttons
  phaseNav.querySelectorAll('.phase-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.phase === phase);
  });

  // Hide all phase content
  phasePreContent.classList.remove('show');
  phaseInContent.classList.remove('show');
  phasePostContent.classList.remove('show');

  // Expand width for post-meeting (action items need more space)
  appContainer.classList.toggle('expanded', phase === 'post');

  // Show appropriate content
  if (phase === 'pre') {
    phasePreContent.classList.add('show');
    renderPreMeeting();
  } else if (phase === 'in') {
    phaseInContent.classList.add('show');
    renderInMeeting();
  } else if (phase === 'post') {
    phasePostContent.classList.add('show');
    renderPostMeeting();
  }

  updateHeaderForPhase();
  requestResize();
}

function updateHeaderForPhase() {
  if (currentPhase === 'pre') {
    headerTime.classList.add('hidden');
    updateHeaderBadge();
  } else if (currentPhase === 'in') {
    headerTime.classList.remove('hidden');
    updateHeaderBadge();
  } else if (currentPhase === 'post') {
    headerTime.classList.add('hidden');
    updateHeaderBadge();
  }
}

function updateHeaderBadge() {
  if (currentPhase === 'pre') {
    const connCount = [connections.fireflies, connections.calendar, connections.gemini].filter(Boolean).length;
    headerBadge.textContent = `${connCount}/3`;
  } else if (currentPhase === 'in') {
    const rem = agendaData.filter(i => !i.archived && !i.covered).length;
    headerBadge.textContent = rem > 0 ? `${rem} rem` : '--';
  } else if (currentPhase === 'post') {
    const pending = actionItems.filter(i => i.status === 'pending').length;
    headerBadge.textContent = pending > 0 ? `${pending} to review` : '--';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS GEAR — toggles Pre-Meeting phase
// ─────────────────────────────────────────────────────────────────────────────
$('closeBtn').addEventListener('click', () => {
  window.electronAPI.quitApp();
});

$('gearBtn').addEventListener('click', () => {
  if (currentPhase === 'pre' && phasePreContent.classList.contains('show')) {
    // Already open, collapse
    phasePreContent.classList.remove('show');
    phaseNav.classList.remove('show');
    requestResize();
  } else {
    switchPhase('pre');
    phaseNav.classList.add('show');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: PRE-MEETING
// ═══════════════════════════════════════════════════════════════════════════════
function renderPreMeeting() {
  renderConnectionStatus();
  renderPreBanner();
  renderUpcomingMeetings();
  loadParticipants();
  requestResize();
}

function renderPreBanner() {
  const banner = $('preBanner');
  const ff = !!connections.fireflies;
  const cal = !!connections.calendar;
  const gem = !!connections.gemini;

  if (ff && gem) {
    banner.innerHTML = '<div class="ready-banner">All set! Switch to In-Meeting when your meeting starts.</div>';
  } else {
    const missing = [];
    if (!ff) missing.push('Fireflies');
    if (!gem) missing.push('Gemini');
    banner.innerHTML = `<div class="setup-banner">Connect ${missing.join(' & ')} to get started.</div>`;
  }
}

// ── Connection UI ────────────────────────────────────────────────────────────
function renderConnectionStatus() {
  const ff = connections.fireflies;
  const cal = connections.calendar;
  const gem = connections.gemini;

  $('ffDot').className = `dot ${ff ? 'connected' : 'disconnected'}`;
  $('ffStatus').textContent = ff ? `Connected (${ff.email || ff.name})` : 'Not connected';
  $('ffInputRow').classList.toggle('hidden', !!ff);
  $('ffDisconnectRow').classList.toggle('hidden', !ff);

  $('calDot').className = `dot ${cal ? 'connected' : 'disconnected'}`;
  $('calStatus').textContent = cal ? `Connected (${cal.email})` : 'Not connected';
  $('calInputRow').classList.toggle('hidden', !!cal);
  $('calDisconnectRow').classList.toggle('hidden', !cal);

  $('gemDot').className = `dot ${gem ? 'connected' : 'disconnected'}`;
  $('gemStatus').textContent = gem ? 'Connected' : 'Not connected';
  $('gemInputRow').classList.toggle('hidden', !!gem);
  $('gemDisconnectRow').classList.toggle('hidden', !gem);

  // Header status
  const anyConnected = ff || cal || gem;
  statusDot.className = `dot ${anyConnected ? 'connected' : 'disconnected'}`;
  statusLabel.textContent = anyConnected ? 'Ready' : 'Setup needed';
}

async function refreshAuthStatus() {
  try {
    const data = await API.getAuthStatus();
    connections.fireflies = data.fireflies?.connected ? { email: data.fireflies.email, name: data.fireflies.name } : null;
    connections.calendar = data.calendar?.connected ? { email: data.calendar.email } : null;
    connections.gemini = data.gemini?.connected ? {} : null;
    renderConnectionStatus();
    updateHeaderBadge();
    if (currentPhase === 'pre') renderPreBanner();
  } catch (e) {
    statusDot.className = 'dot disconnected';
    statusLabel.textContent = 'Backend offline';
  }
}

// ── Connect buttons ──────────────────────────────────────────────────────────
$('ffConnectBtn').addEventListener('click', async () => {
  const key = $('ffKeyInput').value.trim();
  if (!key) return;
  $('ffConnectBtn').textContent = '...';
  try {
    const data = await API.connectFireflies(key);
    if (data.success) { $('ffKeyInput').value = ''; await refreshAuthStatus(); loadTranscripts(); }
    else alert(data.error || 'Failed');
  } catch (e) { alert('Network error'); }
  $('ffConnectBtn').textContent = 'Connect';
});

$('ffDisconnectBtn').addEventListener('click', async () => {
  await API.disconnectFireflies();
  await refreshAuthStatus();
  transcripts = []; analysisById = {};
});

$('calConnectBtn').addEventListener('click', async () => {
  const clientId = $('calClientId').value.trim();
  const clientSecret = $('calClientSecret').value.trim();
  if (!clientId || !clientSecret) return;
  $('calConnectBtn').textContent = '...';
  try {
    const data = await API.connectGoogle(clientId, clientSecret);
    if (data.auth_url) {
      window.electronAPI.openExternal(data.auth_url);
      const poll = setInterval(async () => {
        await refreshAuthStatus();
        if (connections.calendar) {
          clearInterval(poll);
          $('calClientId').value = ''; $('calClientSecret').value = '';
          renderUpcomingEvents();
        }
      }, 2000);
      setTimeout(() => clearInterval(poll), 120000);
    } else alert(data.error || 'Failed');
  } catch (e) { alert('Network error'); }
  $('calConnectBtn').textContent = 'Connect';
});

$('calDisconnectBtn').addEventListener('click', async () => {
  await API.disconnectCalendar();
  await refreshAuthStatus();
  calendarEvents = [];
  renderUpcomingMeetings();
});

$('gemConnectBtn').addEventListener('click', async () => {
  const key = $('gemKeyInput').value.trim();
  if (!key) return;
  $('gemConnectBtn').textContent = '...';
  try {
    const data = await API.connectGemini(key);
    if (data.success) { $('gemKeyInput').value = ''; await refreshAuthStatus(); }
    else alert(data.error || 'Failed');
  } catch (e) { alert('Network error'); }
  $('gemConnectBtn').textContent = 'Connect';
});

$('gemDisconnectBtn').addEventListener('click', async () => {
  await API.disconnectGemini();
  await refreshAuthStatus();
});

$('signoutBtn').addEventListener('click', async () => {
  await API.signOut();
  await refreshAuthStatus();
  transcripts = []; analysisById = {}; actionItems = []; calendarEvents = [];
  selectedTranscriptId = null;
  renderPreMeeting();
});

// ── Upcoming Meetings ─────────────────────────────────────────────────────────
async function renderUpcomingMeetings() {
  const container = $('upcomingEvents');
  if (!connections.calendar) {
    container.innerHTML = '<div class="empty-state">Connect Google Calendar to see meetings.</div>';
    requestResize();
    return;
  }
  container.innerHTML = '<div class="loading-state">Loading meetings...</div>';
  try {
    const data = await API.getCalendarEvents();
    if (data.success && data.events?.length > 0) {
      calendarEvents = data.events;
      container.innerHTML = '';
      data.events.forEach(ev => {
        const card = buildMeetingCard(ev);
        container.appendChild(card);
      });
    } else {
      container.innerHTML = '<div class="empty-state">No upcoming meetings in the next 30 days.</div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state">Failed to load meetings.</div>';
  }
  requestResize();
}

function buildMeetingCard(ev) {
  const card = document.createElement('div');
  card.className = `meeting-card${expandedMeetingId === ev.id ? ' expanded' : ''}`;
  card.dataset.eventId = ev.id;

  const time = ev.start?.includes('T')
    ? new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'All Day';
  const date = new Date(ev.start).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const participants = meetingParticipants[ev.id] || [];
  const attendeeStr = ev.attendee_count > 0 ? `${ev.attendee_count} attendee${ev.attendee_count !== 1 ? 's' : ''}` : '';

  card.innerHTML = `
    <div class="meeting-card-header">
      <span class="meeting-card-time">${time}</span>
      <span class="meeting-card-title">${escHtml(ev.title)}</span>
      <span class="meeting-card-date">${date}</span>
      <span class="meeting-card-chevron">▾</span>
    </div>
    <div class="meeting-card-body">
      <div class="meeting-participants-label">👥 Participants</div>
      <div class="participant-tag-container" data-event-id="${escAttr(ev.id)}">
        ${participants.map((p, i) => `<span class="participant-chip"><span>${escHtml(p)}</span><button class="participant-remove" data-event-id="${escAttr(ev.id)}" data-idx="${i}">×</button></span>`).join('')}
        <input class="participant-text-input" data-event-id="${escAttr(ev.id)}" placeholder="${participants.length ? '' : 'Add name, press Enter'}" />
      </div>
      ${attendeeStr ? `<div class="meeting-attendee-count">${attendeeStr} on calendar</div>` : ''}
    </div>
  `;

  // Toggle expand
  card.querySelector('.meeting-card-header').addEventListener('click', () => {
    const wasExpanded = card.classList.contains('expanded');
    expandedMeetingId = wasExpanded ? null : ev.id;
    card.classList.toggle('expanded', !wasExpanded);
    if (!wasExpanded) card.querySelector('.participant-text-input')?.focus();
    requestResize();
  });

  // Remove participant chip
  card.querySelectorAll('.participant-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const eid = btn.dataset.eventId;
      const idx = parseInt(btn.dataset.idx);
      if (!meetingParticipants[eid]) return;
      meetingParticipants[eid].splice(idx, 1);
      await API.saveParticipants(meetingParticipants);
      renderUpcomingMeetings();
    });
  });

  // Add participant via Enter or comma
  const textInput = card.querySelector('.participant-text-input');
  textInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      await addParticipant(ev.id, textInput.value);
      textInput.value = '';
      expandedMeetingId = ev.id;
      renderUpcomingMeetings();
    } else if (e.key === 'Backspace' && textInput.value === '') {
      const names = meetingParticipants[ev.id] || [];
      if (names.length > 0) {
        names.pop();
        meetingParticipants[ev.id] = names;
        await API.saveParticipants(meetingParticipants);
        expandedMeetingId = ev.id;
        renderUpcomingMeetings();
      }
    }
  });
  textInput.addEventListener('blur', async () => {
    if (textInput.value.trim()) {
      await addParticipant(ev.id, textInput.value);
      textInput.value = '';
      expandedMeetingId = ev.id;
      renderUpcomingMeetings();
    }
  });

  return card;
}

async function addParticipant(eventId, raw) {
  const names = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!names.length) return;
  if (!meetingParticipants[eventId]) meetingParticipants[eventId] = [];
  names.forEach(n => { if (!meetingParticipants[eventId].includes(n)) meetingParticipants[eventId].push(n); });
  await API.saveParticipants(meetingParticipants);
}

// ── Participants ─────────────────────────────────────────────────────────────
async function loadParticipants() {
  try {
    const data = await API.getParticipants();
    if (data.success) { meetingParticipants = data.participants || {}; }
  } catch (e) { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: IN-MEETING
// ═══════════════════════════════════════════════════════════════════════════════
function renderInMeeting() {
  if (!meetingActive) {
    meetingStartEpochMs = Date.now();
    meetingActive = true;
  }
  renderAgenda();
  requestResize();
}

// ── ESC PEEK (preserved from original overlay) ───────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) handleEscDown();
  if (e.key === '`' && !e.repeat) triggerRandomNudge();
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') handleEscUp();
});

window.electronAPI.onEscPressed(() => {
  handleEscDown();
  clearTimeout(globalEscKeepAlive);
  globalEscKeepAlive = setTimeout(() => handleEscUp(), 150);
});

window.electronAPI.onBacktickPressed(() => triggerRandomNudge());
window.electronAPI.onToggleSettings(() => switchPhase('pre'));

function handleEscDown() {
  if (currentPhase !== 'in') return; // Only peek during in-meeting
  if (!isEscDown) {
    isEscDown = true;
    escPressTimer = setTimeout(() => {
      isPeekMode = true;
      // Show in-meeting content if minimized
      if (!phaseInContent.classList.contains('show')) {
        phaseNav.classList.add('show');
        phaseInContent.classList.add('show');
      }
      renderAgenda();
      requestResize();
    }, 350);
  }
}

function handleEscUp() {
  if (isEscDown) {
    isEscDown = false;
    clearTimeout(escPressTimer);
    if (isPeekMode) {
      isPeekMode = false;
      // Collapse back to minimal
      phaseNav.classList.remove('show');
      phaseInContent.classList.remove('show');
      requestResize();
    }
  }
}

// ── End Meeting ──────────────────────────────────────────────────────────────
$('endMeetingBtn').addEventListener('click', () => {
  meetingActive = false;
  switchPhase('post');
  phaseNav.classList.add('show');
  loadTranscripts();
});

// ── Agenda ───────────────────────────────────────────────────────────────────
function renderAgenda() {
  const list = $('agendaList');
  const footerText = $('footerText');
  const rem = agendaData.filter(i => !i.archived && !i.covered).length;

  updateHeaderBadge();
  footerText.textContent = agendaData.length > 0
    ? `${rem} agenda question${rem !== 1 ? 's' : ''} remaining`
    : 'Hold ESC to peek. Press ` to trigger nudge.';

  list.innerHTML = '';

  if (agendaData.length === 0) {
    list.innerHTML = '<div class="empty-state">No agenda questions loaded yet.<br>Use window.setAgenda([...]) to add questions.</div>';
    requestResize();
    return;
  }

  const activeItems = agendaData.filter(i => !i.archived);
  const archivedItems = agendaData.filter(i => i.archived);

  function buildRow(item, isLastActive) {
    const row = document.createElement('div');
    row.className = `row ${item.covered ? 'covered' : ''} ${item.archived ? 'archived' : ''}`;

    const spine = document.createElement('div'); spine.className = 'spine';
    const lineTop = document.createElement('div'); lineTop.className = 'line';
    const circle = document.createElement('div'); circle.className = `circle ${item.covered ? 'covered' : ''}`;
    const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓';
    circle.appendChild(check);
    const lineBot = document.createElement('div'); lineBot.className = 'line';

    if (item === activeItems[0] || item === archivedItems[0]) lineTop.style.visibility = 'hidden';
    if (isLastActive || item === archivedItems[archivedItems.length - 1]) lineBot.style.visibility = 'hidden';

    spine.appendChild(lineTop); spine.appendChild(circle); spine.appendChild(lineBot);

    const textZone = document.createElement('div');
    textZone.className = 'text-zone';
    textZone.textContent = item.text;

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.archived) {
        item.covered = !item.covered;
        if (item.covered && currentNudge && currentNudge.id === item.id) dismissNudge();
        renderAgenda();
      }
    });

    textZone.addEventListener('click', () => {
      item.archived = !item.archived;
      if (item.archived) item.covered = false;
      renderAgenda();
    });

    row.appendChild(spine); row.appendChild(textZone);
    list.appendChild(row);
  }

  activeItems.forEach((item, idx) => buildRow(item, idx === activeItems.length - 1));
  if (archivedItems.length > 0 && activeItems.length > 0) {
    const sep = document.createElement('div'); sep.className = 'sep';
    list.appendChild(sep);
  }
  archivedItems.forEach(item => buildRow(item, false));
  requestResize();
}

// ─────────────────────────────────────────────────────────────────────────────
// NUDGE LOGIC (preserved from original)
// ─────────────────────────────────────────────────────────────────────────────
function showNudge(id, reason, text) {
  let nudgeTextStr = text || '';
  if (id != null) {
    const item = agendaData.find(i => i.id === id);
    if (!item || item.covered || item.archived) return;
    nudgeTextStr = item.text;
  }
  if (!nudgeTextStr) return;

  if (currentNudge) {
    if (currentNudge.pinned) return;
    clearTimeout(currentNudge.timeoutId);
  }

  const nudgeId = id != null ? id : Date.now();
  const timeoutId = setTimeout(() => {
    if (currentNudge && currentNudge.id === nudgeId && !currentNudge.pinned) dismissNudge();
  }, 10000);

  currentNudge = { id: nudgeId, text: nudgeTextStr, reason, pinned: false, timeoutId };
  renderNudge();
}

function dismissNudge() {
  if (currentNudge) clearTimeout(currentNudge.timeoutId);
  currentNudge = null;
  renderNudge();
}

function renderNudge() {
  if (!currentNudge) {
    nudgePanel.classList.remove('show', 'pinned');
    requestResize();
    return;
  }
  nudgeReason.textContent = currentNudge.reason || 'Notification';
  nudgeText.textContent = currentNudge.text;
  nudgePanel.classList.toggle('pinned', !!currentNudge.pinned);
  nudgePanel.classList.add('show');
  requestResize();
}

nudgePanel.addEventListener('click', () => {
  if (!currentNudge) return;
  if (currentNudge.pinned) dismissNudge();
  else { currentNudge.pinned = true; clearTimeout(currentNudge.timeoutId); renderNudge(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────────────────────────────────────────
function updateTimer() {
  if (!meetingActive || !meetingStartEpochMs) return;
  const diff = Date.now() - meetingStartEpochMs;
  const totalSec = Math.floor(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  headerTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
setInterval(updateTimer, 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: POST-MEETING
// ═══════════════════════════════════════════════════════════════════════════════
function renderPostMeeting() {
  renderTranscriptList();
  if (selectedTranscriptId) {
    $('actionItemsPanel').classList.remove('hidden');
    renderActionItems();
    renderAutoSummary();
  }
  requestResize();
}

// ── Meeting Summary ──────────────────────────────────────────────────────────
function renderMeetingSummary() {
  const container = $('meetingSummary');

  // Questions summary
  const totalQ = agendaData.length;
  const covered = agendaData.filter(i => i.covered).length;
  const archived = agendaData.filter(i => i.archived).length;
  const unanswered = agendaData.filter(i => !i.covered && !i.archived).length;

  // Action items summary
  const totalAI = actionItems.length;
  const approved = actionItems.filter(i => i.status === 'approved').length;
  const pending = actionItems.filter(i => i.status === 'pending').length;

  // Meeting duration
  let durationStr = '--';
  if (meetingStartEpochMs) {
    const elapsed = Date.now() - meetingStartEpochMs;
    const mins = Math.floor(elapsed / 60000);
    durationStr = mins > 0 ? `${mins} min` : '< 1 min';
  }

  if (totalQ === 0 && totalAI === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="summary-card">';
  html += '<div class="section-label" style="padding-top:0">Meeting Summary</div>';

  if (meetingStartEpochMs) {
    html += `<div class="summary-stat"><span class="stat-label">Duration</span><span class="stat-value">${durationStr}</span></div>`;
  }

  if (totalQ > 0) {
    html += `<div class="summary-stat"><span class="stat-label">Questions Covered</span><span class="stat-value ${covered === totalQ ? 'good' : 'warn'}">${covered} / ${totalQ}</span></div>`;
    if (unanswered > 0) {
      html += `<div class="summary-stat"><span class="stat-label">Unanswered</span><span class="stat-value warn">${unanswered}</span></div>`;
    }
    if (archived > 0) {
      html += `<div class="summary-stat"><span class="stat-label">Archived/Skipped</span><span class="stat-value">${archived}</span></div>`;
    }
  }

  if (totalAI > 0) {
    html += `<div class="summary-stat"><span class="stat-label">Action Items</span><span class="stat-value">${totalAI}</span></div>`;
    html += `<div class="summary-stat"><span class="stat-label">Approved</span><span class="stat-value good">${approved}</span></div>`;
    if (pending > 0) {
      html += `<div class="summary-stat"><span class="stat-label">Needs Review</span><span class="stat-value warn">${pending}</span></div>`;
    }
  }

  html += '</div>';

  // Unanswered questions list
  if (unanswered > 0) {
    html += '<div class="section-label">Unanswered Questions</div>';
    agendaData.filter(i => !i.covered && !i.archived).forEach(q => {
      html += `<div style="font-size:11px;color:var(--amber);padding:2px 0">• ${escHtml(q.text)}</div>`;
    });
  }

  container.innerHTML = html;
}

// ── Transcripts ──────────────────────────────────────────────────────────────
async function loadTranscripts() {
  if (!connections.fireflies) return;
  try {
    const data = await API.getTranscripts();
    if (data.success) {
      transcripts = data.transcripts || [];
      pollAnalysisStatuses();
      if (currentPhase === 'post') renderTranscriptList();
    }
  } catch (e) { /* silent */ }
}

async function pollAnalysisStatuses() {
  if (!transcripts.length) return;
  const refresh = async () => {
    try {
      const pairs = await Promise.all(
        transcripts.map(async (t) => {
          const data = await API.getAnalysisStatus(t.id);
          return [t.id, data.analysis];
        })
      );
      analysisById = Object.fromEntries(pairs);

      // Nudge on new completed analysis
      pairs.forEach(([tid, analysis]) => {
        if (analysis?.status === 'ready' && analysis.items?.length > 0) {
          const t = transcripts.find(x => x.id === tid);
          if (t && !t._notified) {
            t._notified = true;
            showNudge(null, 'Analysis Complete', `${analysis.items.length} items from "${t.title}" — switch to Post-Meeting to review`);
          }
        }
      });

      if (currentPhase === 'post') renderTranscriptList();
    } catch (e) { /* silent */ }
  };
  refresh();
  clearInterval(analysisPollingInterval);
  analysisPollingInterval = setInterval(refresh, 3000);
}

function renderTranscriptList() {
  const list = $('transcriptList');
  list.innerHTML = '';

  if (transcripts.length === 0) {
    list.innerHTML = '<div class="empty-state">No transcripts found. Connect Fireflies and record a meeting.</div>';
    requestResize();
    return;
  }

  transcripts.forEach(t => {
    const analysis = analysisById[t.id];
    const statusClass = analysis?.status || 'unknown';

    const row = document.createElement('div');
    row.className = `transcript-row ${selectedTranscriptId === t.id ? 'active' : ''}`;
    row.innerHTML = `
      <div class="transcript-info">
        <span class="transcript-title">${escHtml(t.title)}</span>
        <span class="transcript-meta">${new Date(parseInt(t.date)).toLocaleDateString()} · ${Math.round(t.duration / 60)}m</span>
      </div>
      <span class="status-dot ${statusClass}" title="${statusClass}"></span>
    `;
    row.addEventListener('click', (e) => {
      selectTranscript(t.id);
    });
    list.appendChild(row);
  });
  requestResize();
}



async function selectTranscript(tid) {
  selectedTranscriptId = tid;
  activeActionTab = 'pending';
  vcEmailData = null; // reset email state for new transcript
  vcDecision = null;
  $('generateEmailBtn') && ($('generateEmailBtn').textContent = 'Generate Draft');
  renderTranscriptList();

  $('actionItemsPanel').classList.remove('hidden');

  const analysis = analysisById[tid];
  if (analysis?.status === 'ready' && Array.isArray(analysis.items)) {
    actionItems = normalizeItems(analysis.items);
    renderActionItems();
    renderAutoSummary();
  } else {
    actionItems = [];
    renderActionItems();
    renderAutoSummary();
    $('actionItemsList').innerHTML = `
      <div class="empty-state">
        <p style="margin-bottom: 16px; font-size:13px; color:var(--text);">Ensure participants are correctly set in the Pre-Meeting tab before analyzing.</p>
        <button class="btn btn-primary" id="startGenBtn">Start Gemini Analysis</button>
      </div>
    `;
    $('startGenBtn').addEventListener('click', async () => {
      $('actionItemsList').innerHTML = '<div class="loading-state">Analyzing meeting with Gemini...</div>';
      try {
        await API.enqueueAnalysis(tid);
        await pollUntilReady(tid);
        renderAutoSummary();
      } catch (e) {
        $('actionItemsList').innerHTML = `<div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div>`;
      }
    });
  }
  requestResize();
}

async function pollUntilReady(tid, maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const data = await API.getAnalysisStatus(tid);
    const analysis = data.analysis;
    if (analysis?.status === 'ready' && Array.isArray(analysis.items)) {
      analysisById[tid] = analysis;
      actionItems = normalizeItems(analysis.items);
      renderActionItems();
      return;
    }
    if (analysis?.status === 'error') throw new Error(analysis.error || 'Analysis failed');
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error('Timed out waiting for analysis');
}

function normalizeItems(items) {
  return items.map(item => ({
    status: 'pending', priority: '', task_status: 'Not Started',
    ...item,
    owner: Array.isArray(item.owner) ? item.owner : (item.owner ? [item.owner] : []),
    description_flag: item.description_flag || null,
    owner_flag: item.owner_flag || null,
    gap_notes: Array.isArray(item.gap_notes) ? item.gap_notes
      : (item.gap_notes ? item.gap_notes.split(',').map(s => s.trim()).filter(Boolean) : []),
  }));
}

// ── Action Item Rendering ────────────────────────────────────────────────────
$('aiSubtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab-btn');
  if (!btn) return;
  activeActionTab = btn.dataset.tab;
  renderActionItems();
});

$('filterCategory').addEventListener('change', (e) => { 
  filterConfigs.category = e.target.value; 
  filterConfigs.values = []; filterConfigs.dateStart = ''; filterConfigs.dateEnd = ''; 
  renderFilterInputs(); 
  renderActionItems(); 
});
$('sortCategory').addEventListener('change', (e) => { sortConfigs.category = e.target.value; renderActionItems(); });
$('sortDir').addEventListener('change', (e) => { sortConfigs.dir = e.target.value; renderActionItems(); });
$('pushCalendarBtn').addEventListener('click', handlePushToCalendar);
$('createItemBtn').addEventListener('click', handleCreateItem);

function renderFilterInputs() {
  const container = $('filterInputsContainer');
  if (filterConfigs.category === 'none') { container.innerHTML = ''; return; }
  
  if (filterConfigs.category === 'deadline') {
    container.innerHTML = `
      <input type="date" class="edit-field" id="filterDateStart" title="Start Date" />
      <span>-</span>
      <input type="date" class="edit-field" id="filterDateEnd" title="End Date" />
    `;
    $('filterDateStart').addEventListener('change', (e) => { filterConfigs.dateStart = e.target.value; renderActionItems(); });
    $('filterDateEnd').addEventListener('change', (e) => { filterConfigs.dateEnd = e.target.value; renderActionItems(); });
  } else {
    let options = [];
    if (filterConfigs.category === 'priority') options = ['High', 'Medium', 'Low'];
    else if (filterConfigs.category === 'status') options = ['Not Started', 'In Progress', 'Completed'];
    else if (filterConfigs.category === 'owner') {
      options = [...new Set(actionItems.flatMap(i => i.owner || []))].filter(Boolean);
      options.push('Unassigned');
    }
    
    container.innerHTML = `
      <div class="multi-select-container">
        <button class="multi-select-button" id="filterMultiSelectBtn">Select options...</button>
        <div class="multi-select-dropdown" id="filterMultiSelectDropdown">
          ${options.map(o => `
            <label class="multi-select-option">
              <input type="checkbox" value="${escAttr(o)}" /> ${escHtml(o)}
            </label>
          `).join('')}
        </div>
      </div>
    `;

    const btn = $('filterMultiSelectBtn');
    const dropdown = $('filterMultiSelectDropdown');
    const updateBtnText = () => {
      btn.textContent = filterConfigs.values.length ? filterConfigs.values.join(', ') : 'Select options...';
    };
    
    btn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('show'); });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) filterConfigs.values.push(cb.value);
        else filterConfigs.values = filterConfigs.values.filter(v => v !== cb.value);
        updateBtnText();
        renderActionItems();
      });
    });
    // Remove click listener when re-rendering but need a global closer too
  }
}
document.addEventListener('click', () => {
  const dropdown = $('filterMultiSelectDropdown');
  if (dropdown) dropdown.classList.remove('show');
});

function renderActionItems() {
  $('countPending').textContent = actionItems.filter(i => i.status === 'pending').length;
  $('countApproved').textContent = actionItems.filter(i => i.status === 'approved').length;
  $('countRejected').textContent = actionItems.filter(i => i.status === 'rejected').length;

  $('aiSubtabs').querySelectorAll('.subtab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeActionTab);
  });

  $('approvedToolbar').classList.toggle('hidden', activeActionTab !== 'approved');

  let filtered = actionItems.filter(i => i.status === activeActionTab);

  if (filterConfigs.category !== 'none') {
    if (filterConfigs.category === 'deadline') {
      const s = filterConfigs.dateStart ? new Date(filterConfigs.dateStart).getTime() : -Infinity;
      const e = filterConfigs.dateEnd ? new Date(filterConfigs.dateEnd).getTime() : Infinity;
      filtered = filtered.filter(i => {
        if (!i.deadline) return false;
        const d = new Date(i.deadline).getTime();
        return d >= s && d <= e;
      });
    } else if (filterConfigs.values.length > 0) {
      filtered = filtered.filter(i => {
        if (filterConfigs.category === 'priority') return filterConfigs.values.includes(i.priority || '');
        if (filterConfigs.category === 'status') return filterConfigs.values.includes(i.task_status || 'Not Started');
        if (filterConfigs.category === 'owner') {
          const owners = i.owner?.length ? i.owner : ['Unassigned'];
          return owners.some(o => filterConfigs.values.includes(o));
        }
        return true;
      });
    }
  }

  if (sortConfigs.category !== 'none') {
    const dir = sortConfigs.dir === 'asc' ? 1 : -1;
    const rankPriority = (p) => ({ 'High': 0, 'Medium': 1, 'Low': 2 }[p] ?? 3);
    const rankStatus = (s) => ({ 'Completed': 0, 'In Progress': 1, 'Not Started': 2 }[s] ?? 3);
    
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortConfigs.category === 'priority') cmp = rankPriority(a.priority) - rankPriority(b.priority);
      else if (sortConfigs.category === 'status') cmp = rankStatus(a.task_status) - rankStatus(b.task_status);
      else if (sortConfigs.category === 'deadline') {
        const ad = a.deadline ? Date.parse(a.deadline) : Infinity;
        const bd = b.deadline ? Date.parse(b.deadline) : Infinity;
        cmp = ad - bd;
      } else if (sortConfigs.category === 'owner') {
        const av = (a.owner?.[0] || '\uFFFF').toLowerCase();
        const bv = (b.owner?.[0] || '\uFFFF').toLowerCase();
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return cmp * dir;
    });
  }

  const list = $('actionItemsList');
  list.innerHTML = '';

  if (filtered.length === 0) {
    const msg = activeActionTab === 'pending' ? 'No items under review.'
      : activeActionTab === 'approved' ? 'No approved items yet.' : 'No rejected items.';
    list.innerHTML = `<div class="empty-state">${msg}</div>`;
    requestResize(); return;
  }

  filtered.forEach(item => list.appendChild(buildActionCard(item)));
  updateHeaderBadge();
  requestResize();
}

function buildActionCard(item) {
  const card = document.createElement('div');
  card.className = 'ai-card';

  const sourceText = item.source === 'manual' ? '✨ New Action Item' : (item.source === 'suggested' ? '✨ New' : '📝 Transcript');
  let headerHtml = `<span class="source-badge ${item.source === 'suggested' || item.source === 'manual' ? 'suggested' : ''}">${sourceText}</span>`;
  (item.gap_notes || []).forEach(gap => {
    headerHtml += `<span class="flag-badge gap-flag" title="${escAttr(gap)}">⚠️<span class="flag-text">${escHtml(gap)}</span></span>`;
  });
  if (item.description_flag) headerHtml += `<span class="flag-badge description-flag">📋<span class="flag-text">${escHtml(item.description_flag)}</span></span>`;
  if (item.owner_flag) headerHtml += `<span class="flag-badge owner-flag">👤<span class="flag-text">${escHtml(item.owner_flag)}</span></span>`;

  card.innerHTML = `
    <div class="ai-card-header">${headerHtml}</div>
    <textarea class="ai-desc" rows="2" data-id="${item.id}" data-field="description">${escHtml(item.description || '')}</textarea>
    <div class="meta-grid three-col">
      <div class="field-group">
        <label>Owner(s)</label>
        <div class="tag-input-container" data-id="${item.id}">
          ${(item.owner || []).map((o, i) => `<span class="tag-chip"><span class="tag-label">${escHtml(o)}</span><button class="tag-remove" data-id="${item.id}" data-idx="${i}">×</button></span>`).join('')}
          <input class="tag-text-input" data-id="${item.id}" placeholder="${item.owner?.length ? '' : 'Add owner'}" />
        </div>
      </div>
      <div class="field-group">
        <label>Deadline</label>
        <div style="display:flex;gap:4px;">
          <input type="date" class="edit-field" value="${item.deadline || ''}" data-id="${item.id}" data-field="deadline" style="flex:1;" />
          <input type="time" class="edit-field" value="${item.time || ''}" data-id="${item.id}" data-field="time" style="flex:1;" />
        </div>
      </div>
      <div class="field-group">
        <label>Priority</label>
        <select class="edit-field" data-id="${item.id}" data-field="priority">
          <option value="" ${!item.priority ? 'selected' : ''}>--</option>
          <option value="High" ${item.priority === 'High' ? 'selected' : ''}>High</option>
          <option value="Medium" ${item.priority === 'Medium' ? 'selected' : ''}>Medium</option>
          <option value="Low" ${item.priority === 'Low' ? 'selected' : ''}>Low</option>
        </select>
      </div>
    </div>
    <div class="meta-grid">
      <div class="field-group">
        <label>Task Status</label>
        <select class="edit-field" data-id="${item.id}" data-field="task_status">
          <option value="Not Started" ${item.task_status === 'Not Started' ? 'selected' : ''}>Not Started</option>
          <option value="In Progress" ${item.task_status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${item.task_status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
    </div>
    <div class="ai-actions">
      ${activeActionTab === 'pending'
        ? `<button class="btn btn-approve" data-id="${item.id}" data-action="approved">✓ Approve</button><button class="btn btn-reject" data-id="${item.id}" data-action="rejected">✕ Reject</button>`
        : (item.source === 'manual' 
             ? `<button class="btn btn-reject" data-id="${item.id}" data-action="delete">🗑 Delete</button>` 
             : `<button class="btn btn-undo" data-id="${item.id}" data-action="pending">↩ Undo</button>`)}
    </div>
  `;

  // Event delegation
  card.querySelectorAll('[data-field]').forEach(el => {
    const evt = (el.tagName === 'TEXTAREA') ? 'blur' : 'change';
    el.addEventListener(evt, (e) => editItem(parseInt(e.target.dataset.id), e.target.dataset.field, e.target.value));
  });

  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => setItemStatus(parseInt(btn.dataset.id), btn.dataset.action));
  });

  card.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = actionItems.find(i => i.id === parseInt(btn.dataset.id));
      if (item) { item.owner = item.owner.filter((_, i) => i !== parseInt(btn.dataset.idx)); saveAndRender(); }
    });
  });

  card.querySelectorAll('.tag-text-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addOwnerTag(parseInt(input.dataset.id), input.value); input.value = ''; }
      else if (e.key === 'Backspace' && input.value === '') {
        const item = actionItems.find(i => i.id === parseInt(input.dataset.id));
        if (item?.owner.length > 0) { item.owner.pop(); saveAndRender(); }
      }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) { addOwnerTag(parseInt(input.dataset.id), input.value); input.value = ''; } });
  });

  card.querySelectorAll('.flag-badge').forEach(b => b.addEventListener('click', () => b.classList.toggle('expanded')));

  return card;
}

function addOwnerTag(id, raw) {
  const trimmed = raw.trim();
  if (!trimmed) return;
  const item = actionItems.find(i => i.id === id);
  if (!item) return;
  trimmed.split(',').forEach(part => { const p = part.trim(); if (p && !item.owner.includes(p)) item.owner.push(p); });
  saveAndRender();
}

function editItem(id, field, value) {
  const item = actionItems.find(i => i.id === id);
  if (item) { item[field] = value; saveState(); }
}

function setItemStatus(id, status) {
  if (status === 'delete') {
    actionItems = actionItems.filter(i => i.id !== id);
    saveAndRender();
    return;
  }
  const item = actionItems.find(i => i.id === id);
  if (item) { item.status = status; saveAndRender(); }
}

function saveAndRender() { saveState(); renderActionItems(); renderAutoSummary(); }

async function saveState() {
  if (!selectedTranscriptId) return;
  try { await API.saveAnalysis(selectedTranscriptId, actionItems); } catch (e) { /* silent */ }
}

// ── Push to Calendar ─────────────────────────────────────────────────────────
async function handlePushToCalendar() {
  const btn = $('pushCalendarBtn');
  const approvedItems = actionItems.filter(i => i.status === 'approved');
  const deleteItems = actionItems.filter(i => i.status !== 'approved' && i.pushed_to_calendar && i.event_id);
  if (approvedItems.length === 0 && deleteItems.length === 0) return;

  btn.textContent = 'Syncing...'; btn.disabled = true;
  let successCount = 0; const errors = [];

  for (const item of deleteItems) {
    try {
      const data = await API.deleteCalendarEvent(item.event_id);
      if (data.success) { successCount++; item.pushed_to_calendar = false; item.event_id = null; }
      else errors.push(data.error);
    } catch (e) { errors.push(e.message); }
  }

  for (const item of approvedItems) {
    try {
      let startDate, endDate;
      if (item.deadline) {
        startDate = item.deadline;
        const d = new Date(item.deadline); d.setDate(d.getDate() + 1);
        endDate = d.toISOString().split('T')[0];
      } else {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);
        startDate = tomorrow.toISOString().split('T')[0];
        endDate = dayAfter.toISOString().split('T')[0];
      }

      const ownerStr = item.owner?.join(', ') || 'Unassigned';
      let deadlineStr = item.deadline || 'None';
      if (item.deadline) {
        const dateObj = new Date(item.deadline + 'T00:00:00'); // Ensure local date
        const day = dateObj.getDate();
        const suffixes = ["th", "st", "nd", "rd"];
        const v = day % 100;
        const suffix = (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        deadlineStr = `${months[dateObj.getMonth()]} ${day}${suffix}, ${dateObj.getFullYear()}`;
        
        if (item.time) {
          const [h, m] = item.time.split(':');
          const hInt = parseInt(h, 10);
          const ampm = hInt >= 12 ? 'PM' : 'AM';
          const h12 = hInt % 12 || 12;
          deadlineStr += ` @ ${h12}:${m} ${ampm}`;
        }
      }

      const desc = `${item.description}\n\nOwner(s): ${ownerStr}\nDeadline: ${deadlineStr}\nPriority: ${item.priority || 'N/A'}`;
      const isUpdate = !!item.event_id;
      const data = isUpdate
        ? await API.updateCalendarEvent(item.event_id, { summary: (item.description || '').substring(0, 50), description: desc, start_time: startDate, end_time: endDate })
        : await API.createCalendarEvent({ summary: (item.description || '').substring(0, 50), description: desc, start_time: startDate, end_time: endDate });

      if (data.success) { successCount++; item.pushed_to_calendar = true; item.event_id = data.event_id; }
      else errors.push(data.error);
    } catch (e) { errors.push(e.message); }
  }

  saveState();
  btn.disabled = false;
  btn.textContent = errors.length === 0 ? `✓ ${successCount} synced` : `${successCount} synced, ${errors.length} failed`;
  setTimeout(() => { btn.textContent = 'Sync to Calendar'; }, 3000);
}

function handleCreateItem() {
  const newItem = {
    id: Math.max(0, ...actionItems.map(i => i.id)) + 1,
    description: '', owner: [], deadline: '', time: '',
    priority: 'Medium', task_status: 'Not Started', status: 'approved', source: 'manual'
  };
  actionItems.push(newItem);
  activeActionTab = 'approved';
  saveAndRender();
  renderSummaryGenerator();
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE MEETING SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
let generatedSummaryData = null;

const FORMALITY_LABELS = ['Casual', 'Informal', 'Neutral', 'Professional', 'Formal'];

const FORMALITY_PHRASES = [
  // Level 0: Casual
  {
    tldrPrefix: "Quick recap:",
    decisionIntro: "Here's what we decided:",
    questionIntro: "Still up in the air:",
    nextStepsIntro: "Next up:",
    ownerPrefix: "→",
    deadlinePrefix: "due",
  },
  // Level 1: Informal
  {
    tldrPrefix: "Here's the gist:",
    decisionIntro: "Decisions from the meeting:",
    questionIntro: "Open items:",
    nextStepsIntro: "What's next:",
    ownerPrefix: "Owner:",
    deadlinePrefix: "by",
  },
  // Level 2: Neutral
  {
    tldrPrefix: "Summary:",
    decisionIntro: "The following decisions were made:",
    questionIntro: "The following questions remain open:",
    nextStepsIntro: "Next steps:",
    ownerPrefix: "Owner:",
    deadlinePrefix: "Deadline:",
  },
  // Level 3: Professional
  {
    tldrPrefix: "Executive Summary:",
    decisionIntro: "The following key decisions were finalized:",
    questionIntro: "The following items require further resolution:",
    nextStepsIntro: "Action items and next steps:",
    ownerPrefix: "Assigned to:",
    deadlinePrefix: "Due date:",
  },
  // Level 4: Formal
  {
    tldrPrefix: "Meeting Synopsis:",
    decisionIntro: "The convened parties reached consensus on the following:",
    questionIntro: "The following matters remain unresolved and require follow-up:",
    nextStepsIntro: "Prioritized action items requiring completion:",
    ownerPrefix: "Responsible party:",
    deadlinePrefix: "Completion target:",
  },
];

function renderAutoSummary() {
  const section = $('autoMeetingSummary');
  if (!selectedTranscriptId) {
    section.classList.add('hidden');
    renderVCEmailSection();
    requestResize();
    return;
  }
  section.classList.remove('hidden');
  const level = getFormalityLevel();
  generatedSummaryData = buildSummaryData(level);
  renderSummaryOutput(generatedSummaryData);
  renderVCEmailSection();
  requestResize();
}

function getFormalityLevel() {
  return parseInt($('formalitySlider').value);
}

function buildSummaryData(level) {
  const phrases = FORMALITY_PHRASES[level];
  const approvedItems = actionItems.filter(i => i.status === 'approved');

  // Sort by priority
  const priorityRank = { 'High': 0, 'Medium': 1, 'Low': 2 };
  const sortedItems = [...approvedItems].sort((a, b) =>
    (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3)
  );

  const openQs = agendaData.filter(i => !i.covered && !i.archived);
  const openQuestions = openQs.map(q => q.text);

  // TL;DR from Gemini
  const tldrs = analysisById[selectedTranscriptId]?.tldrs || {};
  let tldr = tldrs[`tldr_${level}`];

  if (!tldr && actionItems.length === 0) {
    const transcript = transcripts.find(t => t.id === selectedTranscriptId);
    const meetingName = transcript?.title || 'this meeting';
    tldr = `"${meetingName}" is being analyzed. Please wait...`;
  } else if (!tldr) {
    tldr = 'Gemini TL;DR not available for this transcript.';
  }

  return {
    tldr,
    openQuestions,
    nextSteps: sortedItems,
    phrases,
    level,
  };
}

function summaryToPlainText(data) {
  const p = data.phrases;
  let lines = [];
  lines.push('MEETING SUMMARY');
  lines.push('================');
  lines.push('');
  lines.push('TL;DR');
  lines.push(data.tldr);
  lines.push('');
  lines.push('OPEN QUESTIONS');
  if (data.openQuestions.length > 0) {
    data.openQuestions.forEach(q => lines.push(`• ${q}`));
  } else {
    lines.push('• None — all agenda topics were addressed.');
  }
  lines.push('');
  lines.push('NEXT STEPS');
  if (data.nextSteps.length > 0) {
    data.nextSteps.forEach((item, idx) => {
      const owners = item.owner?.length ? item.owner.join(', ') : 'TBD';
      const deadline = item.deadline ? ` | ${p.deadlinePrefix} ${item.deadline}` : '';
      const priority = item.priority ? `[${item.priority}] ` : '';
      lines.push(`${idx + 1}. ${priority}${item.description}`);
      lines.push(`   ${p.ownerPrefix} ${owners}${deadline}`);
    });
  } else {
    lines.push('• No approved action items.');
  }
  return lines.join('\n');
}

function renderSummaryOutput(data) {
  const container = $('meetingSummaryOutput');
  const p = data.phrases;

  // Priority chip class
  const chipClass = (priority) => {
    if (priority === 'High') return 'priority-chip-high';
    if (priority === 'Medium') return 'priority-chip-medium';
    if (priority === 'Low') return 'priority-chip-low';
    return 'priority-chip-none';
  };

  const openQHtml = data.openQuestions.length > 0
    ? `<ul class="summary-list">${data.openQuestions.map(q => `<li>${escHtml(q)}</li>`).join('')}</ul>`
    : `<div class="summary-empty-section">None — all agenda topics were addressed.</div>`;

  const nextStepsHtml = data.nextSteps.length > 0
    ? data.nextSteps.map((item, idx) => {
        const owners = item.owner?.length ? item.owner.join(', ') : 'TBD';
        const deadline = item.deadline ? ` · ${p.deadlinePrefix} ${item.deadline}` : '';
        const priority = item.priority || '--';
        return `
          <div class="summary-next-item">
            <span class="summary-next-priority ${chipClass(item.priority)}">${escHtml(priority)}</span>
            <div class="summary-next-body">
              <div class="summary-next-desc">${escHtml(item.description || 'Untitled task')}</div>
              <div class="summary-next-meta">${escHtml(p.ownerPrefix)} ${escHtml(owners)}${escHtml(deadline)}</div>
            </div>
          </div>`;
      }).join('')
    : `<div class="summary-empty-section">No approved action items yet.</div>`;

  container.innerHTML = `
    <div class="summary-output">
      <div class="summary-section">
        <div class="summary-tldr">${escHtml(data.tldr)}</div>
      </div>

      <div class="summary-section">
        <div class="summary-section-title">❓ Open Questions</div>
        ${openQHtml}
      </div>

      <div class="summary-section">
        <div class="summary-section-title">✅ Next Steps (by priority)</div>
        ${nextStepsHtml}
      </div>

      <div class="summary-export-row">
        <button class="btn-clipboard" id="copyClipboardBtn">📋 Copy to Clipboard</button>
        <button class="btn-pdf" id="exportPdfBtn">⬇ Export PDF</button>
      </div>
    </div>
  `;

  // Wire export buttons
  $('copyClipboardBtn').addEventListener('click', () => copyToClipboard(data));
  $('exportPdfBtn').addEventListener('click', () => exportAsPDF(data));

  requestResize();
}

function copyToClipboard(data) {
  const text = summaryToPlainText(data);
  navigator.clipboard.writeText(text).then(() => {
    const btn = $('copyClipboardBtn');
    if (!btn) return;
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy to Clipboard'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    // Fallback for environments without clipboard API
    const ta = document.createElement('textarea');
    ta.value = summaryToPlainText(data);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const btn = $('copyClipboardBtn');
    if (btn) { btn.textContent = '✓ Copied!'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = '📋 Copy to Clipboard'; btn.classList.remove('copied'); }, 2000); }
  });
}

function exportAsPDF(data) {
  // Build a print-friendly version in the hidden print frame
  const p = data.phrases;
  const openQLines = data.openQuestions.length > 0
    ? data.openQuestions.map(q => `<li>${escHtml(q)}</li>`).join('')
    : '<li><em>None — all agenda topics were addressed.</em></li>';
  const nextStepsLines = data.nextSteps.length > 0
    ? data.nextSteps.map((item, idx) => {
        const owners = item.owner?.length ? item.owner.join(', ') : 'TBD';
        const deadline = item.deadline ? ` | ${p.deadlinePrefix} ${item.deadline}` : '';
        const priority = item.priority || '--';
        return `<div class="print-next-item"><span class="print-priority">[${escHtml(priority)}]</span> ${escHtml(item.description || 'Untitled task')}<br><small>${escHtml(p.ownerPrefix)} ${escHtml(owners)}${escHtml(deadline)}</small></div>`;
      }).join('')
    : '<p><em>No approved action items.</em></p>';

  const now = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  $('printSummaryContent').innerHTML = `
    <h1>Meeting Summary</h1>
    <div class="print-meta">Generated ${now} &nbsp;·&nbsp; Tone: ${FORMALITY_LABELS[data.level]}</div>
    <h2>TL;DR</h2>
    <p>${escHtml(data.tldr)}</p>
    <h2>Open Questions</h2>
    <ul>${openQLines}</ul>
    <h2>Next Steps (prioritized)</h2>
    ${nextStepsLines}
  `;

  window.print();
}

// Formality slider — always re-renders the auto summary
$('formalitySlider').addEventListener('input', () => {
  if (selectedTranscriptId) requestAnimationFrame(renderAutoSummary);
});


// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION API (for external callers — same as original overlay)
// ═══════════════════════════════════════════════════════════════════════════════
window.setAgenda = (questions) => {
  agendaData = questions.map((q, i) => ({ id: i, text: q, covered: false, archived: false }));
  if (currentPhase === 'in') renderAgenda();
  updateHeaderBadge();
};

window.flagQuestion = (id, reason) => showNudge(id, reason);

window.markCovered = (id) => {
  const item = agendaData.find(i => i.id === id);
  if (item && !item.archived) {
    item.covered = true;
    if (currentNudge && currentNudge.id === item.id) dismissNudge();
    if (currentPhase === 'in') renderAgenda();
    updateHeaderBadge();
  }
};

// ── Random nudge (backtick) ──────────────────────────────────────────────────
function triggerRandomNudge() {
  const available = agendaData.filter(q => !q.covered && !q.archived);
  if (available.length > 0) {
    const q = available[Math.floor(Math.random() * available.length)];
    const reasons = ['Topic Detected', 'Context Shift', 'Audience Interest', 'Suggested Question'];
    window.flagQuestion(q.id, reasons[Math.floor(Math.random() * reasons.length)]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO MODE
// ═══════════════════════════════════════════════════════════════════════════════
let demoActive = false;
let demoTimers = [];

const DEMO_AGENDA = [
  "What is our Q3 revenue target and how does it compare to Q2?",
  "Who owns the vendor evaluation for the analytics platform?",
  "When is the staging migration deadline?",
  "Is the customer interview script ready for the onboarding research?",
  "What is the fallback plan if we miss the feature freeze date?",
];

const DEMO_NUDGE_SCRIPT = [
  // [delay_seconds, question_index, reason]
  [8,  1, "Topic Detected"],
  [16, 0, "Context Shift"],
  [24, 4, "Audience Interest"],
  [32, 3, "Suggested Question"],
];

const DEMO_COVER_SCRIPT = [
  // [delay_seconds, question_index] — simulate questions getting answered
  [12, 1],
  [20, 0],
  [36, 4],
];

$('demoBtn').addEventListener('click', toggleDemo);

// ─────────────────────────────────────────────────────────────────────────────
// DEMO SUMMARY DATA
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_APPROVED_ITEMS = [
  {
    id: 101, description: 'Finalize Q3 revenue model and share with leadership team',
    owner: ['Alex Chen'], deadline: '2026-04-18', priority: 'High',
    status: 'approved', task_status: 'Not Started', source: 'transcript',
    gap_notes: [], description_flag: null, owner_flag: null,
  },
  {
    id: 102, description: 'Complete vendor evaluation for analytics platform and submit recommendation',
    owner: ['Maria Lopez', 'Sam Park'], deadline: '2026-04-25', priority: 'High',
    status: 'approved', task_status: 'Not Started', source: 'transcript',
    gap_notes: [], description_flag: null, owner_flag: null,
  },
  {
    id: 103, description: 'Confirm staging migration timeline with DevOps and update project board',
    owner: ['Jordan Wu'], deadline: '2026-04-15', priority: 'Medium',
    status: 'approved', task_status: 'Not Started', source: 'transcript',
    gap_notes: [], description_flag: null, owner_flag: null,
  },
  {
    id: 104, description: 'Send finalized customer interview script to UX team for review',
    owner: ['Priya Singh'], deadline: '2026-04-14', priority: 'Medium',
    status: 'approved', task_status: 'Not Started', source: 'suggested',
    gap_notes: [], description_flag: null, owner_flag: null,
  },
  {
    id: 105, description: 'Draft fallback plan for feature freeze delay and circulate for comments',
    owner: ['Alex Chen', 'Jordan Wu'], deadline: '2026-04-21', priority: 'Low',
    status: 'approved', task_status: 'Not Started', source: 'transcript',
    gap_notes: [], description_flag: null, owner_flag: null,
  },
];

function buildDemoSummaryData(level) {
  const phrases = FORMALITY_PHRASES[level];
  const tldrByLevel = [
    `Quick recap: The Q3 planning sync ran about 42 min and we locked in 5 action items. We hit 3 of 5 agenda topics and 2 things still need follow-up.`,
    `Here's the gist: The team met for ~42 minutes for Q3 planning. We walked through 7 action items, approving 5. Covered 3 of 5 agenda topics with 2 still open.`,
    `This Q3 planning meeting (approx. 42 min) resulted in 5 approved action items from 7 under review. 3 of 5 agenda questions were addressed; 2 remain open.`,
    `This Q3 planning session (approximately 42 minutes) produced 5 approved action items for follow-through. 3 of 5 agenda topics received substantive discussion; 2 items require further deliberation.`,
    `The convened Q3 planning meeting (approximately 42 minutes) concluded with 5 formally approved action items selected from 7 candidate items under review. 3 of 5 agenda points received substantive discussion; 2 points remain unresolved and necessitate subsequent follow-up.`,
  ];
  return {
    tldr: tldrByLevel[level],
    decisions: [
      'Proceed with Q3 revenue target of $4.2M, aligned with leadership expectations.',
      'Analytics platform vendor evaluation will be led by Maria Lopez and Sam Park.',
      'Staging migration is scheduled for April 20th — DevOps to confirm by April 15th.',
    ],
    openQuestions: [
      'Is the customer interview script ready for the onboarding research sprint?',
      'What is the fallback plan if we miss the feature freeze date?',
    ],
    nextSteps: DEMO_APPROVED_ITEMS,
    phrases,
    level,
  };
}

async function toggleDemo() {
  if (demoActive) {
    await stopDemo();
  } else {
    await startDemo();
  }
}

async function startDemo() {
  demoActive = true;
  $('demoBtn').classList.add('demo-active');
  $('demoBtn').textContent = '■';
  $('demoBtn').title = 'Stop Demo';

  // 1. Enable demo mode on backend (populates mock data)
  await API.enableDemo();

  // 2. Refresh connections — they should now all be connected
  await refreshAuthStatus();
  await loadTranscripts();

  // 3. Show Pre-Meeting phase with everything green
  switchPhase('pre');
  phaseNav.classList.add('show');

  // 4. After a pause, auto-switch to In-Meeting with agenda loaded
  demoTimers.push(setTimeout(() => {
    window.setAgenda(DEMO_AGENDA);
    switchPhase('in');
    phaseNav.classList.add('show');
    phaseInContent.classList.add('show');

    // 5. Run the nudge script (timed nudges during "meeting")
    DEMO_NUDGE_SCRIPT.forEach(([delaySec, qIdx, reason]) => {
      demoTimers.push(setTimeout(() => {
        if (demoActive && currentPhase === 'in') {
          showNudge(qIdx, reason);
        }
      }, delaySec * 1000));
    });

    // 6. Run the cover script (auto-answer questions)
    DEMO_COVER_SCRIPT.forEach(([delaySec, qIdx]) => {
      demoTimers.push(setTimeout(() => {
        if (demoActive && currentPhase === 'in') {
          window.markCovered(qIdx);
        }
      }, delaySec * 1000));
    });

    // 7. After the meeting simulation, auto-switch to Post-Meeting
    demoTimers.push(setTimeout(() => {
      if (demoActive) {
        meetingActive = false;
        switchPhase('post');
        phaseNav.classList.add('show');

        // Auto-select the first transcript after a brief pause
        demoTimers.push(setTimeout(async () => {
          if (demoActive && transcripts.length > 0) {
            await selectTranscript(transcripts[0].id);
          }
          // Inject demo approved items so the Generate button appears
          demoTimers.push(setTimeout(() => {
            if (demoActive) {
              // Merge demo approved items into actionItems
              DEMO_APPROVED_ITEMS.forEach(di => {
                if (!actionItems.find(ai => ai.id === di.id)) {
                  actionItems.push({ ...di });
                }
              });
              activeActionTab = 'approved';
              renderActionItems();
              renderSummaryGenerator();
              renderVCEmailSection();
              requestResize();
            }
          }, 800));
        }, 1500));
      }
    }, 42 * 1000));

  }, 3000));
}

async function stopDemo() {
  demoActive = false;
  $('demoBtn').classList.remove('demo-active');
  $('demoBtn').textContent = '▶';
  $('demoBtn').title = 'Toggle Demo Mode';

  // Clear all scheduled timers
  demoTimers.forEach(t => clearTimeout(t));
  demoTimers = [];

  // Disable demo mode on backend
  await API.disableDemo();

  // Reset state
  agendaData = [];
  actionItems = [];
  transcripts = [];
  analysisById = {};
  selectedTranscriptId = null;
  meetingActive = false;
  meetingStartEpochMs = null;
  dismissNudge();

  await refreshAuthStatus();
  switchPhase('pre');
}

// ═══════════════════════════════════════════════════════════════════════════════
// VC FOLLOW-UP EMAIL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════
let vcEmailData = null;       // { subject, body } — only one email at a time
let vcDecision = null;        // 'pursue' | 'pass'

function renderVCEmailSection() {
  const section = $('vcEmailSection');
  if (!selectedTranscriptId) {
    section.classList.add('hidden');
    requestResize();
    return;
  }
  section.classList.remove('hidden');
  requestResize();
}

// ── Pursue / Pass toggle ─────────────────────────────────────────────────────
$('vcPursueBtn').addEventListener('click', () => setVCDecision('pursue'));
$('vcPassBtn').addEventListener('click', () => setVCDecision('pass'));

function setVCDecision(decision) {
  vcDecision = decision;
  vcEmailData = null;
  $('vcEmailOutput').innerHTML = '';

  $('vcPursueBtn').className = 'vc-decision-btn' + (decision === 'pursue' ? ' selected-pursue' : '');
  $('vcPassBtn').className   = 'vc-decision-btn' + (decision === 'pass'   ? ' selected-pass'   : '');

  // Show reason section
  $('vcReasonSection').classList.remove('hidden');
  $('vcReasonInput').placeholder = decision === 'pursue'
    ? 'e.g. The team impressed us and the market timing looks right...'
    : 'e.g. The space is outside our current focus area...';
  $('vcReasonInput').focus();
  requestResize();
}

// ── Generate button ──────────────────────────────────────────────────────────
$('generateEmailBtn').addEventListener('click', async () => {
  const btn = $('generateEmailBtn');
  const reason       = $('vcReasonInput').value.trim();
  const companyName  = $('vcCompanyName').value.trim() || 'the company';
  const founderName  = $('vcFounderName').value.trim() || 'Founder';
  const vcName       = $('vcVcName').value.trim()      || 'the team';
  const vcFirm       = $('vcVcFirm').value.trim()      || 'our firm';

  if (!vcDecision) {
    $('vcEmailOutput').innerHTML = '<div class="vc-generating" style="color:var(--red)">Please choose Pursue or Pass first.</div>';
    return;
  }
  if (!reason) {
    $('vcEmailOutput').innerHTML = '<div class="vc-generating" style="color:var(--red)">Please enter a brief reason before generating.</div>';
    requestResize();
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  $('vcEmailOutput').innerHTML = '<div class="vc-generating">✨ Generating draft...</div>';
  requestResize();

  try {
    const transcript = transcripts.find(t => t.id === selectedTranscriptId);
    const tldr = analysisById[selectedTranscriptId]?.tldrs?.tldr_2 || transcript?.title || '';
    const approvedItems = actionItems.filter(i => i.status === 'approved');

    const context = {
      decision: vcDecision,
      reason,
      company_name: companyName,
      founder_name: founderName,
      vc_name: vcName,
      vc_firm: vcFirm,
      meeting_title: transcript?.title || 'our meeting',
      tldr,
      action_items: approvedItems.map(i => i.description).filter(Boolean),
    };

    let email = null;
    try {
      const data = await API.generateVCEmails(selectedTranscriptId, context);
      // Backend returns both; we only show the one matching the decision
      if (data.success) {
        email = vcDecision === 'pursue' ? data.continuation : data.rejection;
      }
    } catch (_) { /* fall through to template */ }

    if (!email) {
      const result = buildTemplateEmails(context);
      email = vcDecision === 'pursue' ? result.continuation : result.rejection;
    }

    vcEmailData = email;
    renderVCEmailOutput();
  } catch (e) {
    $('vcEmailOutput').innerHTML = `<div class="vc-generating" style="color:var(--red)">Error: ${escHtml(e.message)}</div>`;
  }

  btn.disabled = false;
  btn.textContent = 'Regenerate';
  requestResize();
});

// Client-side template fallback
function buildTemplateEmails(ctx) {
  const { company_name, founder_name, vc_name, vc_firm, meeting_title, action_items, reason, decision } = ctx;

  const actionList = action_items.length
    ? action_items.slice(0, 3).map(a => `  • ${a}`).join('\n')
    : '';
  const nextStepsSection = actionList ? `\nAs discussed, the key next steps are:\n${actionList}\n` : '';

  const continuation = {
    subject: `Next Steps — ${company_name} x ${vc_firm}`,
    body:
`Hi ${founder_name},

Thank you for taking the time to meet with us. ${reason ? reason : 'It was a genuinely exciting conversation.'}
${nextStepsSection}
We'd love to continue the conversation. I'll follow up shortly to schedule a next call.

Looking forward to it,
${vc_name}
${vc_firm}`,
  };

  const rejection = {
    subject: `Following Up — ${company_name}`,
    body:
`Hi ${founder_name},

Thank you for meeting with us and walking us through ${company_name}'s progress.

After careful consideration, we've decided not to move forward at this stage. ${reason ? reason : 'This reflects our current portfolio focus rather than a judgment on your work.'}

We wish you all the best with your fundraise and hope our paths cross again.

Warmly,
${vc_name}
${vc_firm}`,
  };

  return { success: true, continuation, rejection };
}

function renderVCEmailOutput() {
  if (!vcEmailData) return;
  const container = $('vcEmailOutput');
  const email = vcEmailData;
  const label = vcDecision === 'pursue' ? 'Continuation Email Draft' : 'Pass Email Draft';

  container.innerHTML = `
    <div class="vc-email-output">
      <div class="vc-email-label">${label}</div>
      <div class="vc-email-subject">${escHtml(email.subject)}</div>
      <div class="vc-email-body" id="vcEmailBodyText">${escHtml(email.body)}</div>
    </div>
    <div class="vc-email-copy-row">
      <button class="btn-copy-email" id="copyVcEmailBtn">📋 Copy Email</button>
    </div>
  `;

  $('copyVcEmailBtn').addEventListener('click', () => {
    const fullText = `Subject: ${email.subject}\n\n${email.body}`;
    navigator.clipboard.writeText(fullText).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = fullText; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
    const btn = $('copyVcEmailBtn');
    btn.textContent = '✓ Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Email'; btn.classList.remove('copied'); }, 2000);
  });

  requestResize();
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════════
async function boot() {
  await refreshAuthStatus();

  if (connections.fireflies) loadTranscripts();

  // Show phase nav and open pre-meeting by default
  phaseNav.classList.add('show');
  switchPhase('pre');
}

boot();