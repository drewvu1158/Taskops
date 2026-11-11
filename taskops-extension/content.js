(() => {
  'use strict';
  if (window.__taskOpsOverlayLoaded) return;
  window.__taskOpsOverlayLoaded = true;

  const STORAGE_KEY = 'taskops.overlay.tasks.v1';
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
    host.style.cssText = 'all:initial;position:fixed;inset:0 0 0 auto;width:min(390px,100vw);z-index:2147483647;display:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host{all:initial}*{box-sizing:border-box}button,input,textarea{font:inherit}.shell{height:100vh;display:flex;flex-direction:column;color:#e8edff;background:#0b1326;border-left:1px solid rgba(255,255,255,.12);box-shadow:-18px 0 60px rgba(0,0,0,.45);font:13px/1.45 Inter,system-ui,sans-serif}.head{display:flex;align-items:center;gap:10px;padding:16px 17px;border-bottom:1px solid rgba(255,255,255,.09);background:#101a2e}.logo{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#a978ff);font-size:18px;font-weight:800}.head strong{font-size:16px}.head small{display:block;color:#8290aa}.close{margin-left:auto;width:32px;height:32px;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#aab5ca;background:#17233a;cursor:pointer}.body{flex:1;overflow:auto;padding:16px}.intro{margin:0 0 13px;color:#9aa7bd}.create{display:grid;gap:9px;padding:13px;border:1px solid rgba(169,120,255,.2);border-radius:12px;background:#111c31}textarea{min-height:74px;resize:vertical;padding:10px;border:1px solid rgba(255,255,255,.11);border-radius:8px;color:#eef2ff;background:#0b1528;outline:none}textarea:focus{border-color:#a978ff}.button{border:1px solid rgba(255,255,255,.11);border-radius:8px;padding:9px 11px;color:#e8edff;background:#1a2841;font-weight:700;cursor:pointer}.button.primary{border:0;color:#24064e;background:linear-gradient(135deg,#d2bbff,#a978ff)}.button:hover{filter:brightness(1.12)}.section{display:flex;align-items:center;justify-content:space-between;margin:20px 1px 9px}.section strong{font-size:12px;text-transform:uppercase;letter-spacing:.08em}.count{color:#8491a9}.empty{padding:28px 15px;text-align:center;color:#78869f;border:1px dashed rgba(255,255,255,.12);border-radius:11px}.tasks{display:grid;gap:10px}.task{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#101a2e;overflow:hidden}.task-head{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px}.task h3{margin:0;font-size:14px}.meta{margin-top:3px;color:#7f8da6;font-size:10px}.progress{height:5px;margin-top:9px;overflow:hidden;border-radius:99px;background:#202d46}.progress span{display:block;height:100%;background:linear-gradient(90deg,#4cd7f6,#7c3aed)}.icon{width:28px;height:28px;border:1px solid rgba(255,255,255,.09);border-radius:7px;color:#9aa7bd;background:#17233a;cursor:pointer}.steps{display:grid;gap:1px;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04)}.step{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;padding:9px 12px;background:#0f192c}.step input{width:16px;height:16px;margin-top:1px;accent-color:#7c3aed}.step.done span{text-decoration:line-through;color:#66748d}.tools{display:flex;flex-wrap:wrap;gap:5px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.07)}.tool{padding:3px 6px;border:1px solid #31405b;border-radius:5px;color:#b9c2d2;background:#17243b;font-size:9px}.source{display:block;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#70809b}.notice{position:fixed;right:14px;bottom:14px;max-width:330px;padding:9px 12px;border:1px solid rgba(76,215,246,.28);border-radius:8px;color:#dffaff;background:#102238;box-shadow:0 12px 35px rgba(0,0,0,.35)}
        .button:disabled{cursor:wait;opacity:.65}.notice{max-width:calc(100% - 30px)}
        .app[hidden]{display:none}.session{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px;padding:7px 10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#111c31}.session[hidden]{display:none}.session-email{font-size:10px;color:#9aa7bd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.auth{display:grid;gap:10px}.auth[hidden]{display:none}.auth-form{display:grid;gap:9px}.auth-form[hidden]{display:none}.auth-form p.intro{margin:0}.auth input{min-height:38px;padding:9px 10px;border:1px solid rgba(255,255,255,.11);border-radius:8px;color:#eef2ff;background:#0b1528;outline:none}.auth input:focus{border-color:#a978ff}.auth-error{min-height:16px;margin:0;color:#fda4af;font-size:11px}.link{border:0;padding:0;color:#c4b5fd;background:transparent;font-size:11px;font-weight:700;cursor:pointer;text-decoration:underline}.auth-links{display:flex;justify-content:space-between;gap:8px}.auth-links[hidden]{display:none}
      </style>
      <aside class="shell" aria-label="TaskOps overlay">
        <header class="head"><div class="logo">✓</div><div><strong>TaskOps</strong><small>Page workflow overlay</small></div><button class="close" aria-label="Close TaskOps">×</button></header>
        <main class="body">
          <div class="auth" hidden>
            <p class="intro">Sign in to sync your workflows privately with AWS.</p>
            <form class="auth-form auth-signin">
              <input class="field" type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <input class="field" type="password" name="password" required placeholder="Password" autocomplete="current-password" aria-label="Password">
              <button class="button primary" type="submit">Sign in</button>
            </form>
            <div class="auth-links" data-mode="signin"><button type="button" class="link" data-goto="signup">Create account</button><button type="button" class="link" data-goto="forgot">Forgot password?</button></div>
            <form class="auth-form auth-signup" hidden>
              <input class="field" type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <input class="field" type="password" name="password" required minlength="8" placeholder="8+ chars, upper, lower & number" autocomplete="new-password" aria-label="Password">
              <button class="button primary" type="submit">Create account</button>
            </form>
            <div class="auth-links" data-mode="signup" hidden><button type="button" class="link" data-goto="signin">Have an account? Sign in</button></div>
            <form class="auth-form auth-confirm" hidden>
              <p class="intro">We emailed a code to <b class="confirm-email"></b>.</p>
              <input class="field" type="text" name="code" required inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Verification code">
              <button class="button primary" type="submit">Confirm email</button>
              <div class="auth-links"><button type="button" class="link resend">Resend code</button><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <form class="auth-form auth-forgot" hidden>
              <p class="intro">Enter your email and we will send a reset code.</p>
              <input class="field" type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
              <button class="button primary" type="submit">Send reset code</button>
              <div class="auth-links"><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <form class="auth-form auth-reset" hidden>
              <p class="intro">Enter the code we sent to <b class="reset-email"></b> and choose a new password.</p>
              <input class="field" type="text" name="code" required inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Reset code">
              <input class="field" type="password" name="password" required minlength="8" placeholder="New password" autocomplete="new-password" aria-label="New password">
              <button class="button primary" type="submit">Reset password</button>
              <div class="auth-links"><button type="button" class="link" data-goto="signin">Back to sign in</button></div>
            </form>
            <p class="auth-error" role="alert"></p>
          </div>
          <div class="app">
            <div class="session" hidden><span class="session-email"></span><button class="link signout" type="button">Sign out</button></div>
            <p class="intro">Turn a goal into steps without leaving this page.</p>
            <form class="create"><label for="taskops-goal">What do you need to accomplish?</label><textarea id="taskops-goal" maxlength="500" required placeholder="Research this topic and prepare a summary…"></textarea><button class="button primary" type="submit">Generate workflow</button></form>
            <div class="section"><strong>Saved workflows</strong><span class="count"></span></div><div class="tasks"></div>
          </div>
        </main>
      </aside>`;
    document.documentElement.append(host);
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
