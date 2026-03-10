const { ipcRenderer } = require('electron');

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let agendaData = [];
// item: { id, text, covered: bool, archived: bool }

let isPeekMode = false;
let escPressTimer = null;
let globalEscKeepAlive = null;
let isEscDown = false;

let meetingStartEpochMs = Date.now();

let currentNudge = null;
// nudge: { id, text, reason, pinned: bool, timeoutId }

// ─────────────────────────────────────────────────────────────────────────────
// DOM Elements
// ─────────────────────────────────────────────────────────────────────────────
const appContainer = document.getElementById('app-container');
const agendaContainer = document.getElementById('agendaContainer');
const agendaList = document.getElementById('agendaList');
const headerBadge = document.getElementById('headerBadge');
const footerText = document.getElementById('footerText');
const headerTime = document.getElementById('headerTime');

const nudgePanel = document.getElementById('nudgePanel');
const nudgeReason = document.getElementById('nudgeReason');
const nudgeText = document.getElementById('nudgeText');

// ─────────────────────────────────────────────────────────────────────────────
// RESIZE LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function requestResize() {
  // Wait a tick for DOM to update and render
  setTimeout(() => {
    const rect = appContainer.getBoundingClientRect();
    // width is 320px based on css, height adjusts dynamically
    ipcRenderer.send('resize-window', rect.width, rect.height);
  }, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// ESC PEEK MODE LOGIC (Local & Global)
// ─────────────────────────────────────────────────────────────────────────────

// 1. Local window focused
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) handleEscDown();
  if (e.key === '`' && !e.repeat) triggerRandomNudge();
});

ipcRenderer.on('backtick-pressed', () => {
  triggerRandomNudge();
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') handleEscUp();
});

// 2. Global (when window not focused, `esc-pressed` is spammed while held)
ipcRenderer.on('esc-pressed', () => {
  handleEscDown();

  // The OS will repeat the keydown event. If we don't see another one in 150ms,
  // we assume the user released the key.
  clearTimeout(globalEscKeepAlive);
  globalEscKeepAlive = setTimeout(() => {
    handleEscUp();
  }, 150);
});

function handleEscDown() {
  if (!isEscDown) {
    isEscDown = true;
    escPressTimer = setTimeout(() => {
      isPeekMode = true;
      renderPeekMode();
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
      renderPeekMode();
      requestResize();
    }
  }
}

function renderPeekMode() {
  if (isPeekMode) {
    agendaContainer.classList.add('show');
    renderAgenda();
  } else {
    agendaContainer.classList.remove('show');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA LOGIC & RENDER
// ─────────────────────────────────────────────────────────────────────────────
function getActiveCount() {
  return agendaData.filter(i => !i.archived && !i.covered).length;
}

function updateCounts() {
  const rem = getActiveCount();
  headerBadge.textContent = `${rem} rem`;
  footerText.textContent = `${rem} agenda question${rem !== 1 ? 's' : ''} remaining`;
}

function renderAgenda() {
  updateCounts();
  if (!isPeekMode) {
    requestResize();
    return; // Don't build DOM if hidden
  }

  agendaList.innerHTML = '';

  const activeItems = agendaData.filter(i => !i.archived);
  const archivedItems = agendaData.filter(i => i.archived);

  function buildRow(item, isLastActive) {
    const row = document.createElement('div');
    row.className = `row ${item.covered ? 'covered' : ''} ${item.archived ? 'archived' : ''}`;

    const spine = document.createElement('div');
    spine.className = 'spine';

    const lineTop = document.createElement('div'); lineTop.className = 'line';
    const circle = document.createElement('div'); circle.className = `circle ${item.covered ? 'covered' : ''}`;
    const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓';
    circle.appendChild(check);
    const lineBot = document.createElement('div'); lineBot.className = 'line';

    // Hide lines for continuity
    if (item === activeItems[0] || item === archivedItems[0]) lineTop.style.visibility = 'hidden';
    if (isLastActive || item === archivedItems[archivedItems.length - 1]) lineBot.style.visibility = 'hidden';

    spine.appendChild(lineTop);
    spine.appendChild(circle);
    spine.appendChild(lineBot);

    const textZone = document.createElement('div');
    textZone.className = 'text-zone';
    textZone.textContent = item.text;

    // Interaction
    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.archived) {
        item.covered = !item.covered;
        // If we cover a question, dismiss it from nudge if active
        if (item.covered && currentNudge && currentNudge.id === item.id) {
          dismissNudge();
        }
        renderAgenda();
      }
    });

    textZone.addEventListener('click', () => {
      item.archived = !item.archived;
      if (item.archived) item.covered = false;
      renderAgenda();
    });

    row.appendChild(spine);
    row.appendChild(textZone);
    agendaList.appendChild(row);
  }

  activeItems.forEach((item, idx) => buildRow(item, idx === activeItems.length - 1));

  if (archivedItems.length > 0 && activeItems.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'sep';
    agendaList.appendChild(sep);
  }

  archivedItems.forEach((item) => buildRow(item, false));

  requestResize();
}

// ─────────────────────────────────────────────────────────────────────────────
// NUDGE LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function showNudge(id, reason) {
  const item = agendaData.find(i => i.id === id);
  if (!item || item.covered || item.archived) return; // Don't nudge solved stuff

  if (currentNudge) {
    if (currentNudge.pinned) return; // Ignore new nudges if one is pinned
    clearTimeout(currentNudge.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    if (currentNudge && currentNudge.id === id && !currentNudge.pinned) {
      dismissNudge();
    }
  }, 10000); // 10s auto-dismiss

  currentNudge = { id, text: item.text, reason, pinned: false, timeoutId };
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

  nudgeReason.textContent = currentNudge.reason || "Suggested Question";
  nudgeText.textContent = currentNudge.text;

  if (currentNudge.pinned) {
    nudgePanel.classList.add('pinned');
  } else {
    nudgePanel.classList.remove('pinned');
  }

  nudgePanel.classList.add('show');
  requestResize();
}

nudgePanel.addEventListener('click', () => {
  if (!currentNudge) return;
  if (currentNudge.pinned) {
    dismissNudge();
  } else {
    currentNudge.pinned = true;
    clearTimeout(currentNudge.timeoutId);
    renderNudge();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIMER LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function updateTimer() {
  const diff = Date.now() - meetingStartEpochMs;
  const totalSec = Math.floor(diff / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  headerTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
setInterval(updateTimer, 1000);


// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION STUBS (Simulated Backend Signals)
// ─────────────────────────────────────────────────────────────────────────────
window.setAgenda = (questions) => {
  agendaData = questions.map((q, i) => ({
    id: i,
    text: q,
    covered: false,
    archived: false
  }));
  renderAgenda(); // builds list and resizes
};

window.flagQuestion = (id, reason) => {
  showNudge(id, reason);
};

window.markCovered = (id) => {
  const item = agendaData.find(i => i.id === id);
  if (item && !item.archived) {
    item.covered = true;
    if (currentNudge && currentNudge.id === item.id) dismissNudge();
    renderAgenda();
  }
};

// Start simulation
const MOCK = [
  "Did they mention the primary KPI for Q3?",
  "Who is blocked by the backend migration?",
  "What is the fallback budget?",
  "Is the compliance review scheduled?"
];

// Initialize
window.setAgenda(MOCK);

function triggerRandomNudge() {
  const availableQuestions = agendaData.filter(q => !q.covered && !q.archived);
  if (availableQuestions.length > 0) {
    const randomQ = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    const reasons = ["Topic Detected", "Context Shift", "Audience Interest", "Suggested Question"];
    const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
    window.flagQuestion(randomQ.id, randomReason);
  }
}
