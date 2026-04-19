/** Persists the agent “perspective” role for Gemini enrichment (client-side). */
export const AGENT_ROLES = ['Engineer', 'Executive', 'VC', 'Sales'];
export const DEFAULT_AGENT_ROLE = 'Engineer';

const STORAGE_KEY = 'action_items_agent_role';

export function readAgentRole() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && AGENT_ROLES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_AGENT_ROLE;
}

export function writeAgentRole(role) {
  if (!AGENT_ROLES.includes(role)) return;
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* ignore */
  }
}
