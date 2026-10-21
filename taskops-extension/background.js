'use strict';

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
