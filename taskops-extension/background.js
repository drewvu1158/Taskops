'use strict';

try {
  importScripts('config.js');
} catch (_) {
  globalThis.TASKOPS_CONFIG = {};
}

async function generateWorkflow(goal) {
  const { apiUrl, apiKey } = globalThis.TASKOPS_CONFIG || {};
  if (!apiUrl || !apiKey) {
    throw new Error('TaskOps AI is not configured. Deploy the backend, then reload the extension.');
  }

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ goal, category: 'auto' })
    });
  } catch (_) {
    throw new Error('TaskOps could not reach the AI service.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) throw new Error('TaskOps AI access was denied. Refresh the local API configuration.');
    if (response.status === 429) throw new Error('TaskOps AI is busy or the daily limit was reached. Try again later.');
    throw new Error(body?.error?.message || 'TaskOps could not generate this workflow.');
  }
  return body.workflow;
}

const STORAGE_KEY = 'taskops.overlay.tasks.v1';
let cachedProfile = null;

function apiRoot() {
  return String((globalThis.TASKOPS_CONFIG || {}).apiUrl || '').replace(/\/workflow\/?$/, '');
}

async function readLocal() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const cached = stored[STORAGE_KEY];
  if (Array.isArray(cached)) return { tasks: cached, profile: null };
  if (cached && Array.isArray(cached.tasks)) return { tasks: cached.tasks, profile: cached.profile || null };
  return { tasks: [], profile: null };
}

async function writeLocal(tasks, profile) {
  const record = profile ? { tasks, profile } : { tasks };
  await chrome.storage.local.set({ [STORAGE_KEY]: record });
}

async function apiFetch(path, options = {}) {
  const { apiKey } = globalThis.TASKOPS_CONFIG || {};
  const root = apiRoot();
  if (!root || !apiKey) throw new Error('TaskOps is not configured. Deploy the backend, then reload the extension.');
  const response = await fetch(`${root}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: options.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'TaskOps could not sync workflows.');
  return body;
}

async function loadWorkspace() {
  const local = await readLocal();
  if (local.profile) cachedProfile = local.profile;
  try {
    const remote = await apiFetch('/state');
    if (remote?.initialized && Array.isArray(remote.tasks)) {
      cachedProfile = remote.profile || cachedProfile;
      await writeLocal(remote.tasks, cachedProfile);
      return remote.tasks;
    }
    if (local.tasks.length) {
      await saveWorkspace(local.tasks);
      return local.tasks;
    }
  } catch (_) {
    return local.tasks;
  }
  return local.tasks;
}

async function saveWorkspace(tasks) {
  const profile = cachedProfile;
  await writeLocal(tasks, profile);
  try {
    const body = { tasks };
    if (profile) body.profile = profile;
    const saved = await apiFetch('/state', { method: 'PUT', body: JSON.stringify(body) });
    if (saved?.profile) {
      cachedProfile = saved.profile;
      await writeLocal(saved.tasks || tasks, cachedProfile);
    }
  } catch (_) {}
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TASKOPS_TOGGLE' });
  } catch (_) {
    await chrome.action.setBadgeBackgroundColor({ color: '#fb7185', tabId: tab.id });
    await chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 1800);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TASKOPS_GENERATE') {
    generateWorkflow(message.goal)
      .then(workflow => sendResponse({ ok: true, workflow }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'TASKOPS_STATE_LOAD') {
    loadWorkspace()
      .then(tasks => sendResponse({ ok: true, tasks }))
      .catch(() => sendResponse({ ok: false, tasks: [] }));
    return true;
  }
  if (message?.type === 'TASKOPS_STATE_SAVE') {
    saveWorkspace(Array.isArray(message.tasks) ? message.tasks : [])
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
