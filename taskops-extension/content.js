(() => {
  'use strict';
  if (window.__taskOpsOverlayLoaded) return;
  window.__taskOpsOverlayLoaded = true;

  const STORAGE_KEY = 'taskops.overlay.tasks.v1';

  const THEME_KEY = 'taskops.overlay.theme';

  function detectTheme() {
    try {
      const savedTheme = localStorage.getItem('taskops.theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch (_) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let currentTheme = detectTheme();

  function paintTheme(root, theme, persist = true) {
    const next = theme === 'dark' ? 'dark' : 'light';
    currentTheme = next;
    const shell = root.querySelector('.shell');
    if (shell) shell.dataset.theme = next;
    root.querySelectorAll('.theme-toggle').forEach(button => {
      button.textContent = next === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-pressed', String(next === 'dark'));
      button.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
    if (persist) chrome.storage.local.set({ [THEME_KEY]: next }).catch(() => {});
  }

  let host;
  let tasks = [];


  function makeId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  function cachedTasks(stored) {
    const cached = stored?.[STORAGE_KEY];
    if (Array.isArray(cached)) return cached;
    return Array.isArray(cached?.tasks) ? cached.tasks : [];
  }

  async function loadTasks() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_STATE_LOAD' });
      if (result?.authRequired) {
        tasks = [];
        if (host) showAuthScreen(host.shadowRoot, 'signin');
        return;
      }
      if (result?.ok && Array.isArray(result.tasks)) {
        tasks = result.tasks;
        return;
      }
    } catch (_) {}
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    tasks = cachedTasks(stored);
  }

  function saveTasks() {
    return chrome.runtime.sendMessage({ type: 'TASKOPS_STATE_SAVE', tasks }).catch(async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const profile = stored?.[STORAGE_KEY]?.profile;
      return chrome.storage.local.set({ [STORAGE_KEY]: profile ? { tasks, profile } : tasks });
    });
  }

function createOverlay() {
    host = document.createElement('div');
    host.id = 'taskops-extension-root';
    host.style.cssText = 'all:initial;position:fixed;inset:0 0 0 auto;width:min(400px,100vw);z-index:2147483647;display:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        button,input,textarea { font: inherit; color: inherit; }
        button { cursor: pointer; }
        .shell {
          --bg:#f4f1ea; --surface:#fffcf8; --surface-2:#f7f5f0; --surface-3:#efece5;
          --text:#1c1a16; --muted:#6a655c; --faint:#8a847a; --line:#e4dfd4; --line-strong:#cfc8bb;
          --ink:#1c1a16; --on-ink:#f7f5f0; --green:#2f6a49; --amber:#8a5a22; --red:#8d3c3c;
          --nav-hover:#efece6; --drop-over:#faf6ef; --track:#e7e2d8; --topbar:#f4f1ea;
          --serif:"IBM Plex Serif", Georgia, serif; --sans:"IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
          height:100vh; display:flex; flex-direction:column; color:var(--text); background:var(--bg);
          border-left:1px solid var(--line); font:14px/1.5 var(--sans);
        }
        .shell[data-theme="dark"] {
          --bg:#161613; --surface:#1f1e1a; --surface-2:#25231f; --surface-3:#2c2a24;
          --text:#e9e6de; --muted:#a8a196; --faint:#817b71; --line:#2e2c27; --line-strong:#3f3c35;
          --ink:#e9e6de; --on-ink:#1a1916; --green:#82c19a; --amber:#d0a662; --red:#df9797;
          --nav-hover:#211f1a; --drop-over:#24211c; --track:#302e28; --topbar:#161613;
        }
        .shell h1,.shell h3 { margin:0; font-family:var(--serif); font-weight:500; letter-spacing:-.02em; }
        .head { display:flex; align-items:center; gap:10px; height:56px; padding:0 16px; border-bottom:1px solid var(--line); background:var(--topbar); }
        .logo { width:28px; height:28px; display:grid; place-items:center; border:1px solid var(--line-strong); border-radius:4px; color:var(--text); background:var(--surface); font-family:var(--serif); font-size:16px; font-weight:500; }
        .head-copy strong { display:block; font-size:14px; font-weight:550; line-height:1.1; }
        .head-copy small { display:block; margin-top:2px; color:var(--faint); font-size:11px; }
        .theme-toggle,.close { border:1px solid var(--line-strong); border-radius:4px; background:var(--surface); color:var(--text); }
        .theme-toggle { margin-left:auto; padding:5px 9px; font-size:12px; font-weight:500; }
        .theme-toggle:hover,.close:hover { background:var(--nav-hover); }
        .close { width:32px; height:32px; font-size:18px; line-height:1; }
        .body { flex:1; overflow:auto; padding:18px; }
        .intro { margin:0 0 14px; color:var(--muted); font-size:13px; }
        .create { display:grid; gap:10px; padding:0 0 18px; border:0; border-bottom:1px solid var(--line); border-radius:0; background:transparent; }
        .create label { color:var(--muted); font-size:12px; font-weight:500; }
        textarea,input { min-height:36px; padding:8px 10px; border:1px solid var(--line-strong); border-radius:4px; color:var(--text); background:var(--surface); outline:none; }
        textarea { min-height:74px; resize:vertical; }
        textarea:focus,input:focus { border-color:var(--ink); }
        .button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line-strong); border-radius:4px; padding:8px 12px; color:var(--text); background:var(--surface); font-weight:500; }
        .button:hover { background:var(--nav-hover); }
        .button.primary { border-color:var(--ink); color:var(--on-ink); background:var(--ink); }
        .button.primary:hover { opacity:.86; }
        .button:disabled { cursor:wait; opacity:.55; }
        .section { display:flex; align-items:center; justify-content:space-between; margin:18px 0 10px; }
        .section strong { color:var(--faint); font-size:12px; font-weight:500; letter-spacing:.04em; text-transform:uppercase; }
        .count { color:var(--faint); font-size:12px; }
        .empty { padding:18px 0; color:var(--faint); font-size:13px; border:0; }
        .tasks { display:grid; gap:10px; }
        .task { border:1px solid var(--line); border-radius:4px; background:var(--surface); }
        .task-head { display:grid; grid-template-columns:1fr auto; gap:8px; padding:12px 12px 0; }
        .task h3 { font-size:17px; }
        .meta { margin-top:4px; color:var(--faint); font-size:11px; }
        .source { display:block; max-width:260px; margin-top:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--faint); font-size:11px; }
        .progress { height:2px; margin:10px 0 0; overflow:hidden; background:var(--track); }
        .progress span { display:block; height:100%; background:var(--ink); }
        .icon { width:26px; height:26px; border:1px solid var(--line); border-radius:4px; color:var(--muted); background:var(--surface); }
        .icon:hover { color:var(--text); border-color:var(--line-strong); }
        .steps { display:grid; margin-top:12px; border-top:1px solid var(--line); }
        .step { display:grid; grid-template-columns:auto 1fr; gap:9px; align-items:start; padding:9px 12px; border-bottom:1px solid var(--line); }
        .step:last-child { border-bottom:0; }
        .step input { width:15px; height:15px; min-height:15px; padding:0; margin-top:2px; accent-color:var(--ink); }
        .step.done span { color:var(--faint); text-decoration:line-through; }
        .tools { display:flex; flex-wrap:wrap; gap:6px; padding:10px 12px; border-top:1px solid var(--line); }
        .tool { color:var(--muted); font-size:11px; }
        .tool:not(:last-child)::after { content:"·"; margin-left:6px; color:var(--faint); }
        .session { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 14px; padding:0 0 12px; border-bottom:1px solid var(--line); }
        .session[hidden] { display:none; }
        .session-email { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--faint); font-size:11px; }
        .auth { display:grid; gap:12px; }
        .auth[hidden] { display:none; }
        .auth-form { display:grid; gap:10px; }
        .auth-form[hidden] { display:none; }
        .auth input { width:100%; }
        .auth-error { min-height:16px; margin:0; color:var(--red); font-size:12px; }
        .link { border:0; padding:0; color:var(--text); background:transparent; font-size:12px; font-weight:500; text-decoration:underline; text-underline-offset:3px; }
        .auth-links { display:flex; justify-content:space-between; gap:10px; }
        .auth-links[hidden] { display:none; }
        .app[hidden] { display:none; }
        .notice { position:absolute; right:14px; bottom:14px; max-width:calc(100% - 28px); padding:9px 11px; border:1px solid var(--line-strong); border-radius:4px; color:var(--text); background:var(--surface); }
        :focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
      </style>
      <aside class="shell" data-theme="${currentTheme}" aria-label="TaskOps overlay">
        <header class="head"><div class="logo">T</div><div class="head-copy"><strong>TaskOps</strong><small>Workflow overlay</small></div><button class="theme-toggle" type="button" aria-pressed="false">Dark</button><button class="close" aria-label="Close TaskOps">×</button></header>
        <main class="body">
          <div class="auth" hidden>
            <p class="intro">Sign in to sync your workflows privately with AWS.</p>
            <form class="auth-form auth-signin">
              <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <input type="password" name="password" required placeholder="Password" autocomplete="current-password" aria-label="Password">
              <button class="button primary" type="submit">Sign in</button>
            </form>
            <div class="auth-links" data-mode="signin"><button type="button" class="link" data-goto="signup">Create account</button><button type="button" class="link" data-goto="forgot">Forgot password?</button></div>
            <form class="auth-form auth-signup" hidden>
              <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <input type="password" name="password" required minlength="8" placeholder="8+ characters, upper, lower &amp; number" autocomplete="new-password" aria-label="Password">
              <button class="button primary" type="submit">Create account</button>
            </form>
            <div class="auth-links" data-mode="signup" hidden><button type="button" class="link" data-goto="signin">Have an account? Sign in</button></div>
            <form class="auth-form auth-confirm" hidden>
              <p class="intro">We emailed a code to <b class="confirm-email"></b>.</p>
              <input type="text" name="code" required inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Verification code">
              <button class="button primary" type="submit">Confirm email</button>
              <div class="auth-links"><button type="button" class="link resend">Resend code</button><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <form class="auth-form auth-forgot" hidden>
              <p class="intro">Enter your email and we will send a reset code.</p>
              <input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <button class="button primary" type="submit">Send reset code</button>
              <div class="auth-links"><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <form class="auth-form auth-reset" hidden>
              <p class="intro">Enter the code we sent to <b class="reset-email"></b> and choose a new password.</p>
              <input type="text" name="code" required inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Reset code">
              <input type="password" name="password" required minlength="8" placeholder="New password" autocomplete="new-password" aria-label="New password">
              <button class="button primary" type="submit">Reset password</button>
              <div class="auth-links"><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <p class="auth-error" role="alert"></p>
          </div>
          <div class="app">
            <div class="session" hidden><span class="session-email"></span><button class="link signout" type="button">Sign out</button></div>
            <p class="intro">Describe a goal. Get steps without leaving this page.</p>
            <form class="create"><label for="taskops-goal">What do you need to accomplish?</label><textarea id="taskops-goal" maxlength="500" required placeholder="Research this topic and prepare a summary…"></textarea><button class="button primary" type="submit">Generate workflow</button></form>
            <div class="section"><strong>Saved workflows</strong><span class="count"></span></div><div class="tasks"></div>
          </div>
        </main>
      </aside>`;
    document.documentElement.append(host);
    const shell = root.querySelector('.shell');
    paintTheme(root, currentTheme, false);
    root.querySelector('.theme-toggle').addEventListener('click', () => {
      paintTheme(root, currentTheme === 'dark' ? 'light' : 'dark', true);
    });
    chrome.storage.local.get(THEME_KEY).then(stored => {
      const savedTheme = stored?.[THEME_KEY];
      if (savedTheme === 'light' || savedTheme === 'dark') paintTheme(root, savedTheme, false);
    }).catch(() => {});
    root.querySelector('.close').addEventListener('click', hide);
    root.querySelector('form.create').addEventListener('submit', createTask);
    bindAuth(root);
    renderTasks();
  }

  function showNotice(message) {
    const root = host.shadowRoot;
    root.querySelector('.notice')?.remove();
    const note = document.createElement('div');
    note.className = 'notice';
    note.textContent = message;
    root.append(note);
    setTimeout(() => note.remove(), 2400);
  }

  async function createTask(event) {
    event.preventDefault();
    const root = host.shadowRoot;
    const input = root.querySelector('textarea');
    const button = root.querySelector('.create button');
    const goal = input.value.trim();
    if (!goal) return;

    button.disabled = true;
    button.textContent = 'Generating…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_GENERATE', goal });
      if (!result?.ok) {
        if (result?.code === 'UNAUTHORIZED') {
          showAuthScreen(root, 'signin');
          throw new Error('Your session expired. Sign in again.');
        }
        throw new Error(result?.error || 'TaskOps could not generate this workflow.');
      }
      const workflow = result.workflow;
      if (!workflow || typeof workflow.title !== 'string' || !Array.isArray(workflow.steps) || !Array.isArray(workflow.tools)) {
        throw new Error('TaskOps received an invalid workflow.');
      }
      tasks.unshift({
        id: makeId(),
        title: workflow.title,
        description: goal,
        goal,
        category: workflow.category,
        priority: 'medium',
        due: '',
        sourceTitle: document.title,
        sourceUrl: location.href,
        tools: workflow.tools,
        steps: workflow.steps.map(text => ({ id: makeId(), text, done: false })),
        created: Date.now()
      });
      input.value = '';
      await saveTasks();
      renderTasks();
      showNotice('AI workflow generated and saved.');
    } catch (error) {
      showNotice(error.message || 'TaskOps could not generate this workflow.');
    } finally {
      button.disabled = false;
      button.textContent = 'Generate workflow';
    }
  }

  function renderTasks() {
    if (!host) return;
    const root = host.shadowRoot;
    const list = root.querySelector('.tasks');
    root.querySelector('.count').textContent = `${tasks.length} total`;
    list.replaceChildren();
    if (!tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No saved workflows yet.';
      list.append(empty);
      return;
    }
    tasks.forEach(task => {
      const done = task.steps.filter(step => step.done).length;
      const percent = task.steps.length ? Math.round(done / task.steps.length * 100) : 0;
      const card = document.createElement('article');
      card.className = 'task';
      const head = document.createElement('div');
      head.className = 'task-head';
      const info = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = task.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${done} of ${task.steps.length} steps · ${percent}%`;
      const source = document.createElement('span');
      source.className = 'source';
      source.textContent = task.sourceTitle || task.description || task.goal || 'Saved from TaskOps';
      const progress = document.createElement('div');
      progress.className = 'progress';
      const fill = document.createElement('span');
      fill.style.width = `${percent}%`;
      progress.append(fill);
      info.append(title, meta, source, progress);
      const remove = document.createElement('button');
      remove.className = 'icon';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Delete ${task.title}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        tasks = tasks.filter(item => item.id !== task.id);
        saveTasks();
        renderTasks();
      });
      head.append(info, remove);
      const steps = document.createElement('div');
      steps.className = 'steps';
      task.steps.forEach(step => {
        const row = document.createElement('label');
        row.className = `step${step.done ? ' done' : ''}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = step.done;
        checkbox.addEventListener('change', () => {
          step.done = checkbox.checked;
          saveTasks();
          renderTasks();
        });
        const text = document.createElement('span');
        text.textContent = step.text;
        row.append(checkbox, text);
        steps.append(row);
      });
      const tools = document.createElement('div');
      tools.className = 'tools';
      task.tools.forEach(name => {
        const tool = document.createElement('span');
        tool.className = 'tool';
        tool.textContent = name;
        tools.append(tool);
      });
      card.append(head, steps, tools);
      list.append(card);
    });
  }

  let pendingEmail = '';

  function setAuthMode(root, mode) {
    const forms = { signin: '.auth-signin', signup: '.auth-signup', confirm: '.auth-confirm', forgot: '.auth-forgot', reset: '.auth-reset' };
    for (const key of Object.keys(forms)) root.querySelector(forms[key]).hidden = key !== mode;
    root.querySelectorAll('.auth-links[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== mode; });
    root.querySelector('.auth-error').textContent = '';
  }

  function showAuthError(root, message) {
    root.querySelector('.auth-error').textContent = message || '';
  }

  function showAuthScreen(root, mode = 'signin') {
    root.querySelector('.auth').hidden = false;
    root.querySelector('.app').hidden = true;
    setAuthMode(root, mode);
  }

  function showAppScreen(root, email) {
    root.querySelector('.auth').hidden = true;
    root.querySelector('.app').hidden = false;
    const sessionBar = root.querySelector('.session');
    if (email) {
      sessionBar.hidden = false;
      root.querySelector('.session-email').textContent = email;
    } else {
      sessionBar.hidden = true;
    }
  }

  async function refreshAuthView(root) {
    let status = null;
    try {
      status = await chrome.runtime.sendMessage({ type: 'TASKOPS_AUTH_STATUS' });
    } catch (_) {}
    if (status?.configured && !status?.signedIn) {
      showAuthScreen(root, 'signin');
      return false;
    }
    showAppScreen(root, status?.signedIn ? status.email : '');
    return true;
  }

  async function afterSignedIn(root) {
    showAppScreen(root, '');
    const status = await chrome.runtime.sendMessage({ type: 'TASKOPS_AUTH_STATUS' }).catch(() => null);
    showAppScreen(root, status?.email || '');
    await loadTasks();
    renderTasks();
    setTimeout(() => root.querySelector('textarea')?.focus(), 0);
  }

  function bindAuth(root) {
    root.querySelectorAll('[data-goto]').forEach(button => {
      button.addEventListener('click', () => setAuthMode(root, button.dataset.goto));
    });
    root.querySelector('.signout').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'TASKOPS_SIGN_OUT' }).catch(() => {});
      tasks = [];
      renderTasks();
      showAuthScreen(root, 'signin');
    });
    root.querySelector('.auth-signin').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const email = form.elements.email.value.trim().toLowerCase();
      const password = form.elements.password.value;
      showAuthError(root, '');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_SIGN_IN', email, password });
        if (result?.ok) { await afterSignedIn(root); return; }
        if (result?.code === 'UserNotConfirmedException') {
          pendingEmail = email;
          root.querySelector('.confirm-email').textContent = email;
          setAuthMode(root, 'confirm');
          return;
        }
        showAuthError(root, result?.error || 'Sign in failed. Try again.');
      } catch (_) {
        showAuthError(root, 'TaskOps could not reach the extension background worker.');
      } finally {
        button.disabled = false;
      }
    });
    root.querySelector('.auth-signup').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const email = form.elements.email.value.trim().toLowerCase();
      const password = form.elements.password.value;
      showAuthError(root, '');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_SIGN_UP', email, password });
        if (result?.ok) {
          pendingEmail = email;
          root.querySelector('.confirm-email').textContent = email;
          setAuthMode(root, 'confirm');
          return;
        }
        showAuthError(root, result?.error || 'Could not create the account. Try again.');
      } catch (_) {
        showAuthError(root, 'TaskOps could not reach the extension background worker.');
      } finally {
        button.disabled = false;
      }
    });
    root.querySelector('.auth-confirm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const code = form.elements.code.value.trim();
      showAuthError(root, '');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_CONFIRM_SIGN_UP', email: pendingEmail, code });
        if (result?.ok) { root.querySelector('.auth-signin').elements.email.value = pendingEmail; setAuthMode(root, 'signin'); showNotice('Email confirmed. Sign in to continue.'); return; }
        showAuthError(root, result?.error || 'That code was not accepted.');
      } catch (_) {
        showAuthError(root, 'TaskOps could not reach the extension background worker.');
      } finally {
        button.disabled = false;
      }
    });
    root.querySelector('.resend').addEventListener('click', async () => {
      showAuthError(root, '');
      const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_RESEND_CODE', email: pendingEmail }).catch(() => null);
      showNotice(result?.ok ? 'A new code is on its way.' : (result?.error || 'Could not resend the code.'));
    });
    root.querySelector('.auth-forgot').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const email = form.elements.email.value.trim().toLowerCase();
      showAuthError(root, '');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_FORGOT_PASSWORD', email });
        if (result?.ok) {
          pendingEmail = email;
          root.querySelector('.reset-email').textContent = email;
          setAuthMode(root, 'reset');
          return;
        }
        showAuthError(root, result?.error || 'Could not send the reset code.');
      } catch (_) {
        showAuthError(root, 'TaskOps could not reach the extension background worker.');
      } finally {
        button.disabled = false;
      }
    });
    root.querySelector('.auth-reset').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      const code = form.elements.code.value.trim();
      const password = form.elements.password.value;
      showAuthError(root, '');
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TASKOPS_RESET_PASSWORD', email: pendingEmail, code, password });
        if (result?.ok) { root.querySelector('.auth-signin').elements.email.value = pendingEmail; setAuthMode(root, 'signin'); showNotice('Password reset. Sign in with your new password.'); return; }
        showAuthError(root, result?.error || 'Could not reset the password.');
      } catch (_) {
        showAuthError(root, 'TaskOps could not reach the extension background worker.');
      } finally {
        button.disabled = false;
      }
    });
  }

  function hide() {
    host.style.display = 'none';
  }

  async function toggle() {
    if (!host) createOverlay();
    const opening = host.style.display === 'none';
    host.style.display = opening ? 'block' : 'none';
    if (!opening) return;
    const root = host.shadowRoot;
    const appReady = await refreshAuthView(root);
    if (!appReady) return;
    await loadTasks();
    renderTasks();
    setTimeout(() => root.querySelector('textarea')?.focus(), 0);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'TASKOPS_TOGGLE') toggle();
  });
})();
