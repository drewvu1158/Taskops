'use strict';

try {
  importScripts('config.js');
} catch (_) {
  globalThis.TASKOPS_CONFIG = {};
}

const AUTH_KEY = 'taskops.auth.v1';
const BASE_STORAGE_KEY = 'taskops.overlay.tasks.v1';

function cognitoConfig() {
  const c = (globalThis.TASKOPS_CONFIG || {}).cognito;
  return c && c.userPoolId && c.clientId && c.region ? c : null;
}

async function cognitoRequest(action, payload) {
  const cfg = cognitoConfig();
  if (!cfg) {
    const error = new Error('Sign-in is not configured. Re-run the backend deploy to enable Amazon Cognito.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  let response;
  try {
    response = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityServiceProviderService.${action}` },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    const error = new Error('TaskOps could not reach Amazon Cognito. Check your connection and try again.');
    error.code = 'NETWORK';
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(body?.__type || '').split('#').pop();
    const messages = {
      IncorrectUsernamePasswordException: 'Incorrect email or password.',
      UserNotFoundException: 'Incorrect email or password.',
      NotAuthorizedException: 'Incorrect email or password, or your session expired.',
      UserNotConfirmedException: 'Please confirm your email before signing in.',
      UsernameExistsException: 'An account with that email already exists.',
      InvalidPasswordException: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.',
      InvalidParameterException: 'Check the details and try again.',
      CodeMismatchException: 'That code is not valid. Check the email and try again.',
      ExpiredCodeException: 'That code has expired. Request a new one.',
      LimitExceededException: 'Too many attempts. Wait a moment and try again.',
      TooManyRequestsException: 'Too many attempts. Wait a moment and try again.',
      PasswordResetRequiredException: 'You need to reset your password before signing in.'
    };
    const error = new Error(messages[code] || body?.message || 'Amazon Cognito rejected the request.');
    error.code = code;
    throw error;
  }
  return body;
}

function decodeJwtSub(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map(ch => '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json)?.sub || null;
  } catch (_) {
    return null;
  }
}

async function readAuth() {
  try {
    const stored = await chrome.storage.local.get(AUTH_KEY);
    const session = stored[AUTH_KEY];
    return session && session.idToken && session.sub ? session : null;
  } catch (_) {
    return null;
  }
}

async function writeAuth(session) {
  await chrome.storage.local.set({ [AUTH_KEY]: session });
}

async function clearAuth() {
  try { await chrome.storage.local.remove(AUTH_KEY); } catch (_) {}
}

function sessionFromResult(email, result, previousRefreshToken) {
  const idToken = result?.AuthenticationResult?.IdToken;
  if (!idToken) return null;
  return {
    email,
    sub: decodeJwtSub(idToken),
    idToken,
    refreshToken: result?.AuthenticationResult?.RefreshToken || previousRefreshToken,
    expiresAt: Date.now() + ((result?.AuthenticationResult?.ExpiresIn || 3600) * 1000)
  };
}

async function establishSession(email, password) {
  const cfg = cognitoConfig();
  const result = await cognitoRequest('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cfg.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password }
  });
  const session = sessionFromResult(email, result, null);
  if (!session) {
    const error = new Error('Amazon Cognito did not return a session.');
    error.code = 'NO_SESSION';
    throw error;
  }
  await writeAuth(session);
  return session;
}

async function refreshSession() {
  const cfg = cognitoConfig();
  const current = await readAuth();
  if (!cfg || !current?.refreshToken) return null;
  try {
    const result = await cognitoRequest('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cfg.clientId,
      AuthParameters: { REFRESH_TOKEN: current.refreshToken }
    });
    const session = sessionFromResult(current.email, result, current.refreshToken);
    if (!session) return null;
    await writeAuth(session);
    return session;
  } catch (_) {
    await clearAuth();
    return null;
  }
}

async function currentSession() {
  const current = await readAuth();
  if (!current) return null;
  if (Date.now() > current.expiresAt - 60000) return refreshSession();
  return current;
}

async function authHeaders() {
  const session = await currentSession();
  return session?.idToken ? { Authorization: `Bearer ${session.idToken}` } : {};
}

function storageKeyFor(session) {
  return session?.sub ? `${BASE_STORAGE_KEY}.${session.sub}` : BASE_STORAGE_KEY;
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
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, ...(await authHeaders()) },
      body: JSON.stringify({ goal, category: 'auto' })
    });
  } catch (_) {
    throw new Error('TaskOps could not reach the AI service.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      const error = new Error('Your session expired. Sign in again.');
      error.code = 'UNAUTHORIZED';
      throw error;
    }
    if (response.status === 403) throw new Error('TaskOps AI access was denied. Refresh the local API configuration.');
    if (response.status === 429) throw new Error('TaskOps AI is busy or the daily limit was reached. Try again later.');
    throw new Error(body?.error?.message || 'TaskOps could not generate this workflow.');
  }
  return body.workflow;
}

let cachedProfile = null;

function apiRoot() {
  return String((globalThis.TASKOPS_CONFIG || {}).apiUrl || '').replace(/\/workflow\/?$/, '');
}

async function readLocal(session) {
  const key = storageKeyFor(session);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (Array.isArray(cached)) return { tasks: cached, profile: null };
  if (cached && Array.isArray(cached.tasks)) return { tasks: cached.tasks, profile: cached.profile || null };
  return { tasks: [], profile: null };
}

async function writeLocal(tasks, profile, session) {
  const key = storageKeyFor(session);
  const record = profile ? { tasks, profile } : { tasks };
  await chrome.storage.local.set({ [key]: record });
}

async function apiFetch(path, options = {}) {
  const { apiKey } = globalThis.TASKOPS_CONFIG || {};
  const root = apiRoot();
  if (!root || !apiKey) throw new Error('TaskOps is not configured. Deploy the backend, then reload the extension.');
  const response = await fetch(`${root}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, ...(await authHeaders()) },
    body: options.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'TaskOps could not sync workflows.');
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadWorkspace() {
  const configured = !!cognitoConfig();
  const session = configured ? await currentSession() : null;
  if (configured && !session) return { authRequired: true };

  const local = await readLocal(session);
  if (local.profile) cachedProfile = local.profile;
  try {
    const remote = await apiFetch('/state');
    if (remote?.initialized && Array.isArray(remote.tasks)) {
      cachedProfile = remote.profile || cachedProfile;
      await writeLocal(remote.tasks, cachedProfile, session);
      return remote.tasks;
    }
    if (local.tasks.length) {
      await saveWorkspace(local.tasks);
      return local.tasks;
    }
  } catch (error) {
    if (configured && error?.status === 401) return { authRequired: true };
    return local.tasks;
  }
  return local.tasks;
}

async function saveWorkspace(tasks) {
  const configured = !!cognitoConfig();
  const session = configured ? await currentSession() : null;
  const profile = cachedProfile;
  await writeLocal(tasks, profile, session);
  if (configured && !session) return;
  try {
    const body = { tasks };
    if (profile) body.profile = profile;
    const saved = await apiFetch('/state', { method: 'PUT', body: JSON.stringify(body) });
    if (saved?.profile) {
      cachedProfile = saved.profile;
      await writeLocal(saved.tasks || tasks, cachedProfile, session);
    }
  } catch (_) {}
}

async function authStatus() {
  const cfg = cognitoConfig();
  if (!cfg) return { configured: false, signedIn: false };
  const session = await currentSession();
  return session
    ? { configured: true, signedIn: true, email: session.email }
    : { configured: true, signedIn: false };
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
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_STATE_LOAD') {
    loadWorkspace()
      .then(result => {
        if (result && result.authRequired) {
          sendResponse({ ok: false, authRequired: true, tasks: [] });
        } else {
          sendResponse({ ok: true, tasks: result });
        }
      })
      .catch(() => sendResponse({ ok: false, tasks: [] }));
    return true;
  }
  if (message?.type === 'TASKOPS_STATE_SAVE') {
    saveWorkspace(Array.isArray(message.tasks) ? message.tasks : [])
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'TASKOPS_AUTH_STATUS') {
    authStatus()
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(() => sendResponse({ ok: false, configured: !!cognitoConfig(), signedIn: false }));
    return true;
  }
  if (message?.type === 'TASKOPS_SIGN_IN') {
    const email = String(message.email || '').trim().toLowerCase();
    establishSession(email, String(message.password || ''))
      .then(session => sendResponse({ ok: true, email: session.email }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_SIGN_UP') {
    const cfg = cognitoConfig();
    const email = String(message.email || '').trim().toLowerCase();
    if (!cfg) {
      sendResponse({ ok: false, error: 'Sign-in is not configured. Re-run the backend deploy to enable Amazon Cognito.' });
      return true;
    }
    cognitoRequest('SignUp', {
      ClientId: cfg.clientId,
      Username: email,
      Password: String(message.password || ''),
      UserAttributes: [{ Name: 'email', Value: email }]
    })
      .then(() => sendResponse({ ok: true, email }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_CONFIRM_SIGN_UP') {
    const cfg = cognitoConfig();
    const email = String(message.email || '').trim().toLowerCase();
    cognitoRequest('ConfirmSignUp', { ClientId: cfg?.clientId, Username: email, ConfirmationCode: String(message.code || '').trim() })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_RESEND_CODE') {
    const cfg = cognitoConfig();
    const email = String(message.email || '').trim().toLowerCase();
    cognitoRequest('ResendConfirmationCode', { ClientId: cfg?.clientId, Username: email })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_FORGOT_PASSWORD') {
    const cfg = cognitoConfig();
    const email = String(message.email || '').trim().toLowerCase();
    cognitoRequest('ForgotPassword', { ClientId: cfg?.clientId, Username: email })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_RESET_PASSWORD') {
    const cfg = cognitoConfig();
    const email = String(message.email || '').trim().toLowerCase();
    cognitoRequest('ConfirmForgotPassword', {
      ClientId: cfg?.clientId,
      Username: email,
      ConfirmationCode: String(message.code || '').trim(),
      Password: String(message.password || '')
    })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message, code: error.code || null }));
    return true;
  }
  if (message?.type === 'TASKOPS_SIGN_OUT') {
    clearAuth().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
