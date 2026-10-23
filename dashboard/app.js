/* Lalakum Salma persona dashboard — vanilla JS, no build step. */

'use strict';

const state = {
  config: null,
  saved: null,
  revision: '',
  meta: {},
  health: null,
  guild: { available: false, id: '', name: '', channels: [], categories: [], roles: [] },
  active: 'overview',
  saving: false,
};

const contentEl = document.getElementById('content');
const navEl = document.getElementById('nav');
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const toastEl = document.getElementById('toasts');
const dirtyEl = document.getElementById('dirty-indicator');
const saveBtn = document.querySelector('.topbar [data-action="save"]');

const ICONS = {
  overview:
    '<rect x="3" y="3" width="7.5" height="9.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="12" width="7.5" height="9" rx="2"/><rect x="3" y="16" width="7.5" height="5" rx="2"/>',
  bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8.5 13h.01M15.5 13h.01M9.5 17h5"/>',
  channels: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  advanced:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.6a3.4 3.4 0 0 1 0 6.8"/><path d="M18 20a5.6 5.6 0 0 0-2-4.3"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3 2"/>',
};

function icon(name) {
  const paths = ICONS[name] || ICONS.spark;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const sections = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'overview',
    group: 'General',
    subtitle: 'Bot status and persona switches',
    render: renderOverview,
  },
  {
    id: 'persona',
    label: 'Salma Persona',
    icon: 'bot',
    group: 'Persona',
    subtitle: 'Channels, prompt, pacing, tools and memory',
    render: renderPersona,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'advanced',
    group: 'System',
    subtitle: 'Secrets, raw JSON and environment',
    render: renderAdvanced,
  },
];

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

bindEvents();
init();

async function init() {
  let session;
  try {
    session = await api('/api/session');
  } catch {
    showLogin('Could not reach the dashboard server.');
    return;
  }

  if (!session.authenticated) {
    showLogin();
    return;
  }

  await boot();
}

async function boot() {
  loginEl.classList.add('hidden');
  appEl.classList.remove('hidden');

  try {
    await loadData();
  } catch (err) {
    toast(err.message || 'Failed to load configuration.', 'error', 7000);
    return;
  }

  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (sections.some((section) => section.id === hash)) state.active = hash;

  renderNav();
  renderActive(true);
  setInterval(refreshHealth, 20_000);
}

async function loadData() {
  const [config, guild, health] = await Promise.all([
    api('/api/config'),
    api('/api/guild'),
    api('/api/health'),
  ]);

  state.config = config.config;
  state.saved = clone(config.config);
  state.revision = config.revision;
  state.meta = config.meta;
  state.guild = guild;
  state.health = health;

  updateMetaUi();
  updateDirty();
}

async function loadConfigOnly() {
  const res = await api('/api/config');
  state.config = res.config;
  state.saved = clone(res.config);
  state.revision = res.revision;
  state.meta = res.meta;
  updateMetaUi();
  updateDirty();
}

async function refreshHealth() {
  const wasReady = Boolean(state.health && state.health.bot && state.health.bot.ready);
  try {
    state.health = await api('/api/health');
    updateStatus();
  } catch {
    return;
  }

  if (!wasReady && state.health.bot.ready) {
    try {
      state.guild = await api('/api/guild');
    } catch {
      /* ignore */
    }
    if (isDirty()) {
      toast('Bot connected. Reload to enable channel pickers.', 'info', 6000);
    } else {
      redraw();
      toast('Bot connected — channel pickers are ready.', 'success');
    }
  }
}

async function onLogin(event) {
  event.preventDefault();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    await api('/api/login', { method: 'POST', body: { password } });
    document.getElementById('login-password').value = '';
    await boot();
  } catch (err) {
    errorEl.textContent = err.message || 'Sign in failed.';
  }
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST', body: {} });
  } catch {
    /* ignore */
  }
  state.config = null;
  state.saved = null;
  appEl.classList.add('hidden');
  setSidebarOpen(false);
  showLogin();
}

function showLogin(message) {
  appEl.classList.add('hidden');
  loginEl.classList.remove('hidden');
  setSidebarOpen(false);
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = message || '';
  document.getElementById('login-password').focus();
}

/* ------------------------------------------------------------------ */
/* HTTP + events                                                       */
/* ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const request = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };

  if (options.body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, request);
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;

  if (response.status === 401 && path !== '/api/login') {
    showLogin('Your session expired. Sign in again.');
  }

  if (!response.ok) {
    const error = new Error((data && data.error) || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function bindEvents() {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('input', onFieldChange);
  document.addEventListener('change', onFieldChange);
  document.getElementById('login-form').addEventListener('submit', onLogin);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setSidebarOpen(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (isDirty() && !state.saving) saveConfig();
    }
  });

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id !== state.active) setActive(id, false);
  });

  window.addEventListener('beforeunload', (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    toast(`Unexpected error: ${message}`, 'error', 8000);
  });

  window.addEventListener('error', (event) => {
    if (!event.message) return;
    toast(`Unexpected error: ${event.message}`, 'error', 8000);
  });
}

function onFieldChange(event) {
  const el = event.target;
  if (!el || typeof el.dataset !== 'object' || !el.dataset.path || !state.config) return;
  setPath(state.config, el.dataset.path, readValue(el));
  updateDirty();
}

async function onDocumentClick(event) {
  const navButton = event.target.closest('[data-nav]');
  if (navButton) {
    setActive(navButton.dataset.nav, true);
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;

  const action = button.dataset.action;
  try {
    switch (action) {
      case 'save':
        await saveConfig();
        return;
      case 'reload':
        await reloadAll();
        return;
      case 'toggle-sidebar':
        setSidebarOpen(!document.body.classList.contains('nav-open'));
        return;
      case 'close-sidebar':
        setSidebarOpen(false);
        return;
      case 'logout':
        await logout();
        return;
      case 'list-add':
        addListItem(button);
        return;
      case 'list-remove':
        removeListItem(button);
        return;
      case 'persona-test':
        await runSalmaTest();
        return;
      case 'clear-salma-memory':
        if (window.confirm('Delete every note Salma has saved for this server? This cannot be undone.')) {
          await runAction('/api/actions/clear-salma-memory', {}, 'Salma memory cleared.');
        }
        return;
      case 'raw-apply':
        applyRawJson();
        return;
      case 'raw-reset':
        state.config = clone(state.saved);
        redraw();
        toast('Reverted to the last saved configuration.', 'info');
        return;
      case 'reload-disk':
        await reloadFromDisk();
        return;
      case 'save-secrets':
        await saveSecrets();
        return;
      default:
        return;
    }
  } catch (err) {
    toast(err.message || 'Action failed.', 'error', 7000);
  }
}

/* ------------------------------------------------------------------ */
/* Save / reload                                                       */
/* ------------------------------------------------------------------ */

function isDirty() {
  return Boolean(
    state.config && state.saved && JSON.stringify(state.config) !== JSON.stringify(state.saved),
  );
}

function updateDirty() {
  const dirty = isDirty();
  if (saveBtn) saveBtn.disabled = !dirty || state.saving;
  dirtyEl.classList.toggle('hidden', !dirty);
}

async function saveConfig(silent = false) {
  if (state.saving || !state.config) return false;
  state.saving = true;
  updateDirty();

  try {
    const res = await api('/api/config', {
      method: 'PUT',
      body: { config: state.config, revision: state.revision },
    });

    state.config = res.config;
    state.saved = clone(res.config);
    state.revision = res.revision;
    state.meta = res.meta;
    updateMetaUi();
    if (!silent) toast('Configuration saved — changes are live.', 'success');
    redraw();
    return true;
  } catch (err) {
    if (err.status === 409 && err.data && err.data.config) {
      state.config = err.data.config;
      state.saved = clone(err.data.config);
      state.revision = err.data.revision;
      state.meta = err.data.meta || state.meta;
      updateMetaUi();
      redraw();
      toast('Config changed elsewhere. Loaded the latest version — re-apply your edits.', 'error', 8000);
    } else {
      toast(err.message || 'Could not save the configuration.', 'error', 8000);
    }
    return false;
  } finally {
    state.saving = false;
    updateDirty();
  }
}

async function reloadAll() {
  if (isDirty() && !window.confirm('Discard unsaved changes and reload config.json?')) return;
  await loadData();
  redraw();
  toast('Reloaded from config.json.', 'info');
}

async function reloadFromDisk() {
  if (isDirty() && !window.confirm('Discard unsaved changes and reload the file from disk?')) return;
  const res = await api('/api/actions/reload-config', { method: 'POST', body: {} });
  state.config = res.config;
  state.saved = clone(res.config);
  state.revision = res.revision;
  state.meta = res.meta;
  updateMetaUi();
  redraw();
  toast('Reloaded config.json from disk.', 'success');
}

async function saveAndRun(action) {
  const saved = await saveConfig(true);
  if (!saved) return;
  await action();
}

async function runAction(path, body, successMessage) {
  await saveAndRun(async () => {
    await api(path, { method: 'POST', body });
    toast(successMessage, 'success');
    await loadConfigOnly();
    redraw();
  });
}

/* ------------------------------------------------------------------ */
/* Structural edits                                                    */
/* ------------------------------------------------------------------ */

function addListItem(button) {
  const path = button.dataset.path;
  const picker = contentEl.querySelector(`[data-add-list="${path}"]`);
  const value = picker ? picker.value : '';
  if (!value) {
    toast('Pick a value first.', 'error');
    return;
  }
  const list = getPath(state.config, path) || [];
  if (!list.includes(value)) list.push(value);
  setPath(state.config, path, list);
  redraw();
}

function removeListItem(button) {
  const path = button.dataset.path;
  const index = Number(button.dataset.index);
  const list = getPath(state.config, path) || [];
  if (index >= 0 && index < list.length) list.splice(index, 1);
  redraw();
}

async function runSalmaTest() {
  const input = document.getElementById('salma-test-text');
  const text = input ? input.value.trim() : '';
  if (!text) {
    toast('Write the message Salma should react to first.', 'error');
    return;
  }

  const resultEl = document.getElementById('salma-result');
  try {
    await saveAndRun(async () => {
      if (resultEl) resultEl.textContent = 'Thinking…';
      const result = await api('/api/ai/persona-test', { method: 'POST', body: { text } });
      if (resultEl) {
        const tools = result.toolCalls && result.toolCalls.length ? result.toolCalls.join(', ') : 'none';
        const sticker = result.stickerId ? ` [sticker ${result.stickerId}]` : '';
        const mode =
          result.action === 'reply' ? (result.replyToTrigger ? ' (reply)' : ' (bare message)') : '';
        resultEl.textContent =
          `Action: ${result.action === 'reply' ? 'REPLY' : 'SILENT'}\n` +
          `Model: ${result.model}\n` +
          `Tools: ${tools}\n\n` +
          (result.action === 'reply'
            ? `${result.message || '(sticker only)'}${sticker}${mode}`
            : 'Salma would stay quiet.') +
          '\n\nDry run — nothing was posted.';
      }
    });
  } catch (err) {
    if (resultEl) resultEl.textContent = err.message || 'Persona test failed.';
    throw err;
  }
}

function applyRawJson() {
  const textarea = document.getElementById('raw-json');
  try {
    const parsed = JSON.parse(textarea.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Top-level JSON must be an object.');
    }
    state.config = parsed;
    redraw();
    toast('JSON applied to the form. Click "Save changes" to write it.', 'info', 6000);
  } catch (err) {
    toast(`Invalid JSON: ${err.message}`, 'error', 8000);
  }
}

async function saveSecrets() {
  const token = document.getElementById('secret-token').value.trim();
  const geminiApiKey = document.getElementById('secret-gemini').value.trim();
  if (!token && !geminiApiKey) {
    toast('Enter a new token or Gemini API key first.', 'error');
    return;
  }
  if (isDirty() && !window.confirm('Save secrets and discard the unsaved changes on this page?')) {
    return;
  }

  const result = await api('/api/secrets', { method: 'POST', body: { token, geminiApiKey } });
  document.getElementById('secret-token').value = '';
  document.getElementById('secret-gemini').value = '';
  await loadConfigOnly();
  redraw();
  toast(result.note || 'Secrets saved.', 'success', 7000);
}

/* ------------------------------------------------------------------ */
/* Render helpers                                                      */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(object, path) {
  return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function setPath(object, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let current = object;
  for (const part of parts) {
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = /^\d+$/.test(part) ? [] : {};
    }
    current = current[part];
  }
  current[last] = value;
}

function readValue(el) {
  const type = el.dataset.type || 'string';
  if (type === 'bool') return Boolean(el.checked);
  if (type === 'number') {
    const value = Number(el.value);
    return Number.isFinite(value) ? value : 0;
  }
  if (type === 'csv') return splitCsv(el.value);
  return el.value;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function card(title, body, options = {}) {
  return `<section class="card ${options.className || ''}">
    <header class="card-head">
      <div>
        <h2>${esc(title)}</h2>
        ${options.subtitle ? `<p class="muted">${esc(options.subtitle)}</p>` : ''}
      </div>
      ${options.actions ? `<div class="card-actions">${options.actions}</div>` : ''}
    </header>
    <div class="card-body">${body}</div>
  </section>`;
}

function field(label, control, hint = '') {
  return `<div class="field">
    <label>${esc(label)}</label>
    ${control}
    ${hint ? `<span class="hint">${hint}</span>` : ''}
  </div>`;
}

function grid(fields, cols = 2) {
  return `<div class="grid cols-${cols}">${fields.filter(Boolean).join('')}</div>`;
}

function textInput(path, value, options = {}) {
  const attrs = [
    'class="input"',
    `data-path="${esc(path)}"`,
    'data-type="string"',
    `value="${esc(value == null ? '' : value)}"`,
  ];
  if (options.placeholder) attrs.push(`placeholder="${esc(options.placeholder)}"`);
  if (options.maxlength) attrs.push(`maxlength="${options.maxlength}"`);
  if (options.list) attrs.push(`list="${esc(options.list)}"`);
  return `<input ${attrs.join(' ')}>`;
}

function numberInput(path, value, options = {}) {
  const attrs = [
    'class="input"',
    `data-path="${esc(path)}"`,
    'data-type="number"',
    `value="${value == null ? '' : esc(value)}"`,
    `min="${options.min == null ? 0 : options.min}"`,
    `max="${options.max == null ? 99999 : options.max}"`,
    `step="${options.step == null ? 1 : options.step}"`,
  ];
  if (options.placeholder) attrs.push(`placeholder="${esc(options.placeholder)}"`);
  return `<input type="number" ${attrs.join(' ')}>`;
}

function textarea(path, value, options = {}) {
  const attrs = ['class="input"', `data-path="${esc(path)}"`, 'data-type="string"'];
  if (options.id) attrs.push(`id="${esc(options.id)}"`);
  if (options.placeholder) attrs.push(`placeholder="${esc(options.placeholder)}"`);
  const rows = options.rows || 3;
  return `<textarea ${attrs.join(' ')} rows="${rows}">${esc(value == null ? '' : value)}</textarea>`;
}

function toggle(path, checked, label, hint = '') {
  return `<label class="toggle-row">
    <span class="toggle-text"><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <input type="checkbox" data-path="${esc(path)}" data-type="bool" ${checked ? 'checked' : ''}>
    <span class="toggle"></span>
  </label>`;
}

function optionsSelect(options, settings = {}) {
  const items = options.slice();
  const value = settings.value == null ? '' : settings.value;
  if (value !== '' && !items.some((option) => String(option.value) === String(value))) {
    items.unshift({ value, label: `⚠ Unknown: ${value}` });
  }
  const attrs = ['class="input"'];
  if (settings.id) attrs.push(`id="${esc(settings.id)}"`);
  return `<select ${attrs.join(' ')}>${items
    .map(
      (option) =>
        `<option value="${esc(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${esc(option.label)}</option>`,
    )
    .join('')}</select>`;
}

function select(path, value, options, settings = {}) {
  const items = options.slice();
  const current = value == null ? '' : value;
  if (current !== '' && !items.some((option) => String(option.value) === String(current))) {
    items.unshift({ value: current, label: `⚠ Unknown: ${current}` });
  }
  return `<select class="input" data-path="${esc(path)}" data-type="${settings.type || 'string'}">${items
    .map(
      (option) =>
        `<option value="${esc(option.value)}" ${String(option.value) === String(current) ? 'selected' : ''}>${esc(option.label)}</option>`,
    )
    .join('')}</select>`;
}

function channelOptions(allowEmpty = true, emptyLabel = '— none —') {
  const options = state.guild.channels.map((channel) => ({
    value: channel.id,
    label: `#${channel.name}${channel.parentName ? ` · ${channel.parentName}` : ''}`,
  }));
  if (allowEmpty) options.unshift({ value: '', label: emptyLabel });
  return options;
}

function channelSelect(path, value, settings = {}) {
  if (!state.guild.available) return textInput(path, value, { placeholder: 'Discord channel ID' });
  return select(path, value, channelOptions(settings.allowEmpty !== false, settings.emptyLabel), settings);
}

function channelLabel(id) {
  const channel = state.guild.channels.find((entry) => entry.id === id);
  return channel ? `#${channel.name}` : `⚠ ${id}`;
}

function chipList(path, ids) {
  const values = Array.isArray(ids) ? ids : [];
  if (!state.guild.available) {
    return textInput(path, values.join(', '), { placeholder: 'Comma-separated IDs' }).replace(
      'data-type="string"',
      'data-type="csv"',
    );
  }

  const chips = values.length
    ? values
        .map(
          (id, index) =>
            `<span class="chip"><span>${esc(channelLabel(id))}</span><button type="button" class="chip-x" data-action="list-remove" data-path="${esc(path)}" data-index="${index}" aria-label="Remove">×</button></span>`,
        )
        .join('')
    : '<span class="muted tiny">None configured</span>';

  return `<div class="chips">${chips}</div>
    <div class="row">
      ${optionsSelect(channelOptions(true, '— add a channel —'), { id: '' }).replace(
        '<select class="input"',
        `<select class="input" data-add-list="${esc(path)}"`,
      )}
      <button type="button" class="btn small" data-action="list-add" data-path="${esc(path)}">Add</button>
    </div>`;
}

function statCard(label, value, sub, iconName = '', tone = 'violet') {
  return `<div class="stat tone-${tone}">
    <div class="stat-top">
      <span class="stat-label">${esc(label)}</span>
      ${iconName ? `<span class="stat-icon">${icon(iconName)}</span>` : ''}
    </div>
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-sub">${esc(sub)}</div>
  </div>`;
}

function formatUptime(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/* ------------------------------------------------------------------ */
/* Render: overview                                                    */
/* ------------------------------------------------------------------ */

function renderOverview() {
  const cfg = state.config;
  const persona = cfg.persona || {};
  const health = state.health || { bot: {}, guild: {}, persona: {} };
  const bot = health.bot || {};
  const guild = health.guild || {};
  const personaHealth = health.persona || {};

  const botAvatar = bot.avatar
    ? `<img src="${esc(bot.avatar)}" alt="" loading="lazy">`
    : `<span>${esc((bot.tag || 'S').slice(0, 1).toUpperCase())}</span>`;
  const guildIcon = guild.icon
    ? `<img class="hero-guild-icon" src="${esc(guild.icon)}" alt="" loading="lazy">`
    : '';

  const hero = `<section class="hero">
    <div class="hero-identity">
      <span class="hero-avatar ${bot.ready ? 'is-online' : ''}">${botAvatar}</span>
      <div class="hero-text">
        <span class="eyebrow">${bot.ready ? 'Bot connected' : 'Not connected'}</span>
        <h2>${esc(persona.displayName || 'Lalakum Salma')}</h2>
        <div class="hero-tags">
          <span class="pill ${persona.enabled ? 'ok' : 'warn'}">${persona.enabled ? 'Persona enabled' : 'Persona disabled'}</span>
          <span class="pill ${bot.ready ? 'ok' : 'bad'}"><span class="dot"></span>${bot.ready ? 'Online' : 'Offline'}</span>
          ${
            guild.name
              ? `<span class="pill">${guildIcon}<span>${esc(guild.name)}</span></span>`
              : '<span class="pill warn">No server connected</span>'
          }
        </div>
      </div>
    </div>
    <div class="hero-metrics">
      <div class="hero-metric"><span>Ping</span><strong>${bot.ping != null && bot.ping >= 0 ? `${esc(bot.ping)} ms` : '—'}</strong></div>
      <div class="hero-metric"><span>Uptime</span><strong>${esc(formatUptime(bot.uptimeSeconds))}</strong></div>
      <div class="hero-metric"><span>Members</span><strong>${guild.memberCount ? esc(guild.memberCount) : '—'}</strong></div>
      <div class="hero-metric"><span>Memory</span><strong>${esc(personaHealth.memoryNotes == null ? '—' : personaHealth.memoryNotes)}</strong></div>
    </div>
  </section>`;

  const statusCards = `<div class="stats">
    ${statCard(
      'Persona',
      persona.enabled ? 'Active' : 'Off',
      persona.enabled ? 'reading its channels' : 'no channel is streamed',
      'bot',
      persona.enabled ? 'violet' : 'amber',
    )}
    ${statCard(
      'Channels',
      (persona.channelIds || []).length,
      'listening channels',
      'channels',
      'blue',
    )}
    ${statCard('Model', persona.model || '—', 'Gemini Live', 'spark', 'green')}
    ${statCard(
      'Memory notes',
      personaHealth.memoryNotes == null ? '—' : personaHealth.memoryNotes,
      'durable notes',
      'history',
      'pink',
    )}
  </div>`;

  const quickToggles = [
    toggle('persona.enabled', persona.enabled, 'Enable Salma', 'Stream the configured channels to the model'),
    toggle('persona.showTyping', persona.showTyping, 'Show the typing indicator', 'Appears while she decides'),
    toggle('persona.toolsEnabled', persona.toolsEnabled, 'Information tools', 'History, member info, server/voice info, time, reactions'),
    toggle('persona.memoryEnabled', persona.memoryEnabled, 'Memory', 'Save and recall durable notes about members'),
  ].join('');

  const keyReady = Boolean(state.meta.geminiKeyConfigured);

  return `${hero}
    ${statusCards}
    ${card('Quick toggles', quickToggles, {
      subtitle: 'Flip a switch, then press “Save changes” — no restart needed.',
    })}
    ${card(
      'Runtime',
      `<div class="section-note">${icon('info')}<span>
        ${
          keyReady
            ? 'The Gemini API key is configured. Salma reuses one Live session across messages and recycles it automatically.'
            : '<strong>No Gemini API key configured.</strong> Add one under Advanced → Secrets before enabling the persona.'
        }
      </span></div>
      <div class="section-note">${icon('spark')}<span>
        <strong>Changes apply instantly.</strong> The dashboard runs inside the bot process, so saving writes
        <code>${esc(state.meta.configPath || 'config.json')}</code> and updates the running config at the same time.
      </span></div>
      <div class="section-note">${icon('users')}<span>
        The persona only reads and replies inside the channels you pick. Bots are context, never triggers.
      </span></div>`,
      { subtitle: 'What runs under the hood' },
    )}`;
}

/* ------------------------------------------------------------------ */
/* Render: persona                                                     */
/* ------------------------------------------------------------------ */

function renderPersona() {
  const cfg = state.config.persona || {};
  const notes = state.meta.salmaMemoryNotes;
  const keyReady = Boolean(state.meta.geminiKeyConfigured);

  const modelField = `${textInput('persona.model', cfg.model, {
    placeholder: 'gemini-3.8-live',
    list: 'salma-models',
  })}
  <datalist id="salma-models">
    <option value="gemini-3.8-live"></option>
    <option value="gemini-3.8-live-extended-thinking"></option>
  </datalist>`;

  return `<p class="intro">Lalakum Salma is a Gemini Live personality with her own voice, ego and memory.
    She reads the channels you pick, keeps a short conversation history, and decides for herself whether to speak,
    send a sticker, or stay quiet. She is socially active: direct questions, jokes, insults and Gojo debates all
    count as invitations. The runtime contract (decision tools, Discord formatting, Arabizi-only Darija) is
    appended to the character prompt automatically.</p>

    ${card(
      'Persona engine',
      `${toggle('persona.enabled', cfg.enabled, 'Enable Lalakum Salma', 'While this is off, no channel is streamed to the model.')}
      ${grid(
        [
          field(
            'Display name',
            textInput('persona.displayName', cfg.displayName, { placeholder: 'Lalakum Salma', maxlength: 32 }),
          ),
          field(
            'Model',
            modelField,
            'gemini-3.8-live is the low-latency model. The extended-thinking variant needs a thinking level.',
          ),
          field(
            'Thinking level',
            select('persona.thinkingLevel', cfg.thinkingLevel, [
              { value: 'minimal', label: 'minimal' },
              { value: 'low', label: 'low' },
              { value: 'medium', label: 'medium' },
              { value: 'high', label: 'high' },
            ]),
            'Ignored for gemini-3.8-live.',
          ),
          field(
            'Temperature',
            numberInput('persona.temperature', cfg.temperature, { min: 0, max: 2, step: 0.1 }),
            '1 is the default; lower is more predictable.',
          ),
          field(
            'Response timeout (ms)',
            numberInput('persona.requestTimeoutMs', cfg.requestTimeoutMs, {
              min: 5000,
              max: 60000,
              step: 1000,
            }),
            'A timeout means silence, never a late reply.',
          ),
        ],
        2,
      )}
      <div class="section-note">${icon('info')}<span>
        ${
          keyReady
            ? 'The Gemini API key is configured.'
            : '<strong>No Gemini API key configured.</strong> Add one under Advanced → Secrets before enabling Salma.'
        }
      </span></div>`,
      { subtitle: 'Model and response budget' },
    )}

    ${card(
      'Where she listens',
      `<div class="field">
        <label>Channels</label>
        ${chipList('persona.channelIds', cfg.channelIds || [])}
        <span class="hint">Salma reads every message in these channels and can answer in them. Empty = she listens nowhere.</span>
      </div>
      ${grid(
        [
          field(
            'History size',
            numberInput('persona.historySize', cfg.historySize, { min: 1, max: 100 }),
            'How many earlier messages are sent as context.',
          ),
          field(
            'Batch window (ms)',
            numberInput('persona.batchWindowMs', cfg.batchWindowMs, { min: 250, max: 30000, step: 250 }),
            'Messages arriving in this window become one decision.',
          ),
        ],
        2,
      )}`,
      { subtitle: 'Channels and conversation context' },
    )}

    ${card(
      'Pacing and style',
      `${grid(
        [
          field(
            'Reply cooldown (seconds)',
            numberInput('persona.replyCooldownSeconds', cfg.replyCooldownSeconds, { min: 0, max: 86400 }),
            'Minimum gap between two replies. 0 = no cooldown.',
          ),
          field(
            'Decision cooldown (seconds)',
            numberInput('persona.decisionCooldownSeconds', cfg.decisionCooldownSeconds, {
              min: 0,
              max: 3600,
            }),
            'Minimum gap between model evaluations. Higher is cheaper and calmer.',
          ),
          field(
            'Max replies per hour',
            numberInput('persona.maxRepliesPerHour', cfg.maxRepliesPerHour, { min: 0, max: 1000 }),
            '0 = unlimited. A safety net, not a target.',
          ),
          field(
            'Max message length',
            numberInput('persona.maxMessageLength', cfg.maxMessageLength, { min: 1, max: 2000 }),
            'Characters. Shorter messages feel more human.',
          ),
        ],
        2,
      )}
      <div class="grid cols-2">
        ${toggle('persona.showTyping', cfg.showTyping, 'Show the typing indicator', 'Appears while she decides, including when she stays silent.')}
        ${toggle('persona.toolsEnabled', cfg.toolsEnabled, 'Enable information tools', 'History, member info, server/voice info, time, reactions, emojis and stickers.')}
        ${toggle('persona.memoryEnabled', cfg.memoryEnabled, 'Enable memory', 'Let Salma save and recall durable notes about members.')}
      </div>`,
      { subtitle: 'Cooldowns, length and capabilities' },
    )}

    ${card(
      'Character prompt',
      `${field(
        'System prompt',
        textarea('persona.systemPrompt', cfg.systemPrompt, { rows: 20 }),
        'The full Salma character prompt. Empty uses the built-in Salma prompt. The runtime contract (decision tools, formatting, Arabizi policy) is appended automatically.',
      )}`,
      { subtitle: 'Who Salma is' },
    )}

    ${card(
      'Test the persona',
      `<div class="section-note">${icon('spark')}<span>
        <strong>Dry run.</strong> Saves the current settings, sends one message to the model with the last few channel messages as context,
        and shows the decision. Nothing is posted to Discord.
      </span></div>
      <div class="field">
        <label>Message to react to</label>
        <textarea class="input" id="salma-test-text" rows="3" placeholder="e.g. Salma, ch7al f 1+1?"></textarea>
      </div>
      <div class="btn-row"><button class="btn small" data-action="persona-test">Ask Salma</button></div>
      <div class="preview" id="salma-result">Decision will appear here.</div>`,
      { subtitle: 'See what she would do before enabling her' },
    )}

    ${card(
      'Memory',
      `<p class="muted">Salma can save short factual notes about members and the server across restarts.
        Notes are stored in <code>data/salma-memory.json</code> and are never shown in Discord.</p>
      <div class="row">
        <span class="pill">${notes == null ? '—' : esc(notes)} saved note${notes === 1 ? '' : 's'}</span>
        <button class="btn small danger" data-action="clear-salma-memory" ${notes ? '' : 'disabled'}>Clear memory</button>
      </div>`,
      { subtitle: 'Durable notes' },
    )}`;
}

/* ------------------------------------------------------------------ */
/* Render: advanced                                                    */
/* ------------------------------------------------------------------ */

function renderAdvanced() {
  const meta = state.meta || {};
  const tokenPill = `<span class="pill ${meta.tokenConfigured ? 'ok' : 'bad'}">${meta.tokenConfigured ? 'Configured' : 'Missing'}</span>`;
  const keyPill = `<span class="pill ${meta.geminiKeyConfigured ? 'ok' : 'bad'}">${meta.geminiKeyConfigured ? 'Configured' : 'Missing'}</span>`;
  const raw = JSON.stringify(state.config, null, 2);

  return `<p class="intro">The raw editor writes the same object the bot uses. Secrets are omitted from this view; saving preserves the
    existing token and Gemini key.</p>

    ${card(
      'Secrets',
      `${grid(
        [
          field(
            'Bot token',
            `<div class="row">${tokenPill}<span class="muted tiny">${esc(meta.tokenSource || 'missing')}</span></div>
             <input class="input" id="secret-token" type="password" autocomplete="off" placeholder="Paste a new bot token to replace the saved one">`,
            '<code>BOT_TOKEN</code> in .env overrides the file. A token change needs a bot restart.',
          ),
          field(
            'Gemini API key',
            `<div class="row">${keyPill}<span class="muted tiny">${esc(meta.geminiKeySource || 'missing')}</span></div>
             <input class="input" id="secret-gemini" type="password" autocomplete="off" placeholder="Paste a new Gemini API key">`,
            '<code>GEMINI_API_KEY</code> in .env overrides the file. A new key is picked up automatically.',
          ),
        ],
        2,
      )}
      <div class="btn-row"><button class="btn small" data-action="save-secrets">Save secrets</button>
        <span class="muted tiny">Leave a field blank to keep the current value.</span></div>`,
      { subtitle: 'Write-only secret fields' },
    )}

    ${card(
      'Raw configuration JSON',
      `${field(
        'config.json',
        `<textarea class="input tall" id="raw-json" spellcheck="false">${esc(raw)}</textarea>`,
        'Apply to form loads the JSON into the dashboard without saving. Then press “Save changes”.',
      )}
      <div class="btn-row">
        <button class="btn small" data-action="raw-apply">Apply to form</button>
        <button class="btn small ghost" data-action="raw-reset">Reset to saved</button>
        <button class="btn small ghost" data-action="reload-disk">Reload file from disk</button>
        <button class="btn small primary" data-action="save">Save changes</button>
      </div>`,
      { subtitle: 'Everything at once, for advanced edits' },
    )}

    ${card(
      'Environment',
      `<div class="table-wrap"><table>
        <tbody>
          <tr><th>Config file</th><td><code>${esc(meta.configPath || 'config.json')}</code></td></tr>
          <tr><th>Token source</th><td>${esc(meta.tokenSource || 'missing')}</td></tr>
          <tr><th>Gemini key source</th><td>${esc(meta.geminiKeySource || 'missing')}</td></tr>
          <tr><th>Revision</th><td><code>${esc(state.revision)}</code></td></tr>
          <tr><th>Dashboard</th><td><code>${esc((state.health && state.health.dashboard && state.health.dashboard.host) || '127.0.0.1')}:${esc((state.health && state.health.dashboard && state.health.dashboard.port) || 3000)}</code></td></tr>
        </tbody>
      </table></div>`,
      { subtitle: 'Where values come from' },
    )}`;
}

/* ------------------------------------------------------------------ */
/* Nav + status + toasts                                               */
/* ------------------------------------------------------------------ */

function renderNav() {
  const groups = [];
  for (const section of sections) {
    let group = groups.find((entry) => entry.name === section.group);
    if (!group) {
      group = { name: section.group, items: [] };
      groups.push(group);
    }
    group.items.push(section);
  }

  navEl.innerHTML = groups
    .map(
      (group) => `<div class="nav-group">
        <span class="nav-group-label">${esc(group.name)}</span>
        ${group.items
          .map((section) => {
            const active = section.id === state.active;
            return `<button class="nav-item ${active ? 'active' : ''}" data-nav="${section.id}" title="${esc(section.label)}"${
              active ? ' aria-current="page"' : ''
            }>
              <span class="nav-icon">${icon(section.icon)}</span>
              <span class="nav-label">${esc(section.label)}</span>
            </button>`;
          })
          .join('')}
      </div>`,
    )
    .join('');
}

function setSidebarOpen(open) {
  document.body.classList.toggle('nav-open', open);
  const button = document.querySelector('.menu-btn');
  if (button) button.setAttribute('aria-expanded', String(open));
}

function renderActive(resetScroll = false) {
  const section = sections.find((entry) => entry.id === state.active) || sections[0];
  if (!state.config) return;

  document.getElementById('section-title').textContent = section.label;
  document.getElementById('section-subtitle').textContent = section.subtitle || '';
  document.title = `${section.label} · Lalakum Salma`;

  const scrollY = window.scrollY;
  contentEl.innerHTML = section.render();
  contentEl.classList.remove('swap');
  void contentEl.offsetWidth;
  contentEl.classList.add('swap');
  updateDirty();

  if (resetScroll) {
    window.scrollTo({ top: 0 });
  } else {
    window.scrollTo(0, scrollY);
  }
}

function redraw() {
  renderNav();
  renderActive();
}

function setActive(id, updateHash) {
  if (!sections.some((section) => section.id === id)) return;
  state.active = id;
  if (updateHash && window.location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
  }
  setSidebarOpen(false);
  renderNav();
  renderActive(true);
}

function updateMetaUi() {
  const pathEl = document.getElementById('config-path');
  const meta = state.meta || {};
  pathEl.textContent = `${meta.configPath || 'config.json'} · token: ${meta.tokenSource || 'missing'}`;
  updateStatus();
}

function updateStatus() {
  const statusEl = document.getElementById('bot-status');
  const health = state.health;
  if (!statusEl || !health) return;

  const ready = Boolean(health.bot && health.bot.ready);
  statusEl.classList.toggle('online', ready);
  statusEl.classList.toggle('offline', !ready);
  const text = statusEl.querySelector('.status-text');
  if (text) {
    const guild = health.guild && health.guild.name ? ` · ${health.guild.name}` : '';
    text.textContent = ready ? `Online${guild}` : 'Bot offline';
  }

  const topbarStatus = document.getElementById('topbar-status');
  if (topbarStatus) {
    topbarStatus.classList.toggle('ok', ready);
    topbarStatus.classList.toggle('bad', !ready);
    const label = topbarStatus.querySelector('.status-label');
    if (label) label.textContent = ready ? 'Bot online' : 'Bot offline';
  }

  const avatar = document.getElementById('brand-avatar');
  const letter = document.getElementById('brand-letter');
  const avatarUrl = health.bot && health.bot.avatar;
  if (avatar && letter) {
    if (avatarUrl) {
      avatar.src = avatarUrl;
      avatar.classList.remove('hidden');
      letter.classList.add('hidden');
    } else {
      avatar.classList.add('hidden');
      letter.classList.remove('hidden');
    }
  }
}

function toast(message, type = 'info', timeout = 4500) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastEl.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(4px)';
    node.style.transition = 'opacity .2s, transform .2s';
    setTimeout(() => node.remove(), 220);
  }, timeout);
}
