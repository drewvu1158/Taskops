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
  if (message?.type !== 'TASKOPS_GENERATE') return false;
  generateWorkflow(message.goal)
    .then(workflow => sendResponse({ ok: true, workflow }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
