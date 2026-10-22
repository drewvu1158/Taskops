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

  async function loadTasks() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    tasks = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  }

  function saveTasks() {
    return chrome.storage.local.set({ [STORAGE_KEY]: tasks });
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
      </style>
      <aside class="shell" aria-label="TaskOps overlay">
        <header class="head"><div class="logo">✓</div><div><strong>TaskOps</strong><small>Page workflow overlay</small></div><button class="close" aria-label="Close TaskOps">×</button></header>
        <main class="body">
          <p class="intro">Turn a goal into steps without leaving this page.</p>
          <form class="create"><label for="taskops-goal">What do you need to accomplish?</label><textarea id="taskops-goal" maxlength="500" required placeholder="Research this topic and prepare a summary…"></textarea><button class="button primary" type="submit">Generate workflow</button></form>
          <div class="section"><strong>Saved workflows</strong><span class="count"></span></div><div class="tasks"></div>
        </main>
      </aside>`;
    document.documentElement.append(host);
    root.querySelector('.close').addEventListener('click', hide);
    root.querySelector('form').addEventListener('submit', createTask);
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
      if (!result?.ok) throw new Error(result?.error || 'TaskOps could not generate this workflow.');
      const workflow = result.workflow;
      if (!workflow || typeof workflow.title !== 'string' || !Array.isArray(workflow.steps) || !Array.isArray(workflow.tools)) {
        throw new Error('TaskOps received an invalid workflow.');
      }
      tasks.unshift({
        id: makeId(),
        title: workflow.title,
        goal,
        category: workflow.category,
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
      source.textContent = task.sourceTitle || 'Saved from TaskOps';
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

  function hide() {
    host.style.display = 'none';
  }

  async function toggle() {
    if (!host) {
      await loadTasks();
      createOverlay();
    }
    host.style.display = host.style.display === 'none' ? 'block' : 'none';
    if (host.style.display === 'block') setTimeout(() => host.shadowRoot.querySelector('textarea').focus(), 0);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'TASKOPS_TOGGLE') toggle();
  });
})();
