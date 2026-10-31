/* Offline V7.3 amendment. The interval reads an in-memory fixture, NEVER AF or Kubernetes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), app = $('app');
  const source = 'prototype-control-plane-a', namespace = 'kubernaut-system';
  const demoStart = Date.parse('2026-10-28T14:09:00Z');
  let clockStart = performance.now(), signedIn = true, interval = null, toastKey = null, epoch = 0, contextKey = '';
  let pollReads = 0, toastCount = 0, lastMessage = 'Synthetic fixtures only. No live reads.', timerEnabled = true;
  const feed = new Map(), rows = new Map();
  const fixtures = {
    'rar-demo-01': { name: 'rar-demo-01', namespace, decision: 'Pending', requiredBy: '2026-10-28T14:21:00Z' },
    'rar-demo-02': { name: 'rar-demo-02', namespace, decision: 'Pending', requiredBy: '2026-10-28T14:13:00Z' },
    'rar-demo-03': { name: 'rar-demo-03', namespace, decision: 'Pending', requiredBy: '2026-10-28T14:27:00Z' },
  };
  const demoNow = () => demoStart + performance.now() - clockStart;
  /** Introduce one immutable deadline per fixture identity within this demo scope. */
  function fresh(name) {
    if (feed.has(name)) return feed.get(name);
    const fixture = fixtures[name];
    const record = { ...fixture, requiredBy: new Date(demoNow() + Date.parse(fixture.requiredBy) - demoStart).toISOString() };
    feed.set(name, record);
    projectDeadline(record);
    return record;
  }
  const host = document.createElement('div'); host.className = 'notification-host';
  host.innerHTML = '<button class="notification-toggle" id="notification-toggle" type="button" aria-label="Notifications, no unread alerts" aria-expanded="false" aria-controls="notification-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="notification-count" class="notification-count" hidden></span></button><section class="notification-panel" id="notification-panel" aria-labelledby="notification-heading" hidden><h2 id="notification-heading">Notifications</h2><p class="notification-note">This browser session · not an assignment or inbox total</p><p class="notification-empty" id="notification-empty">No new approval alerts in this session.</p><ul id="notification-list"></ul><div class="notification-inbox"><a href="#approvals" id="notification-inbox">Open Approvals inbox →</a></div></section>';
  app.querySelector('.app-header').append(host);
  const toast = document.createElement('section'); toast.className = 'notification-toast'; toast.id = 'notification-toast'; toast.hidden = true; toast.setAttribute('aria-label', 'New approval alert');
  toast.innerHTML = '<div class="notification-toast-head"><strong class="notification-attention"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2 19 18H1L10 2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 7v5m0 2v.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Approval request available</strong><button type="button" class="notification-close" id="notification-toast-close" aria-label="Dismiss approval alert">×</button></div><p id="notification-toast-name"></p><p id="notification-toast-scope"></p><a id="notification-toast-link">Open approval review →</a>';
  app.append(toast);
  const live = document.createElement('div'); live.id = 'notification-live'; live.className = 'notification-live'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); app.append(live);
  const controls = document.createElement('details'); controls.id = 'notification-demo'; controls.className = 'notification-demo';
  controls.innerHTML = '<summary>Notification study · offline controls</summary><div class="notification-demo-body"><div class="notification-demo-controls"><label><input id="notification-periodic" type="checkbox" checked> Simulated polling every 15 seconds</label><button type="button" id="notification-investigation">Receive investigation approval</button><button type="button" id="notification-queue">Queue another RAR for poll</button><button type="button" id="notification-poll">Poll now</button><button type="button" id="notification-resolve">Decide elsewhere (simulation)</button><button type="button" id="notification-reset">Reset example</button><button type="button" id="notification-logout">Simulate logout</button></div><p id="notification-demo-status" role="status"></p><p>Only Synthetic safety / layout studies can generate alerts. The first complete poll establishes a quiet baseline. Repeated investigation/poll detections share one identity; this is not a live event or auth implementation.</p></div>';
  document.querySelector('.preview-tools').after(controls);
  const activeContext = () => [$('evidence-dataset')?.value, $('access-preview')?.value, $('topology')?.value].join('|');
  const allowed = () => signedIn && $('evidence-dataset')?.value === 'synthetic' && ['operations', 'approvals'].includes($('access-preview')?.value) && ['fleet', 'local'].includes($('topology')?.value);
  const hrefFor = record => record.source === source && record.namespace === namespace && Object.hasOwn(fixtures, record.name) ? '#review/' + record.name : null;
  /** Project the same offline record into the existing inbox and confirmation source. */
  function projectDeadline(record) {
    if (!allowed()) return;
    const deadline = new Date(record.requiredBy).toISOString().slice(11, 16) + ' UTC';
    cases[record.name].deadline = deadline;
    const cell = document.querySelector(`tr[data-request^="${record.name} "]`)?.cells[4];
    if (cell) {
      const remaining = document.createElement('span');
      remaining.textContent = Math.max(0, Math.ceil((Date.parse(record.requiredBy) - demoNow()) / 60000)) + ' min';
      if (record.name === 'rar-demo-02') remaining.className = 'pill warning';
      const due = document.createElement('small'); due.textContent = 'Due ' + deadline;
      cell.dataset.requiredBy = record.requiredBy;
      cell.replaceChildren(remaining, due);
    }
    if (activeScreen === 'review' && activeCase === record.name && $('review-deadline').textContent !== deadline) {
      window.KubernautClearDecision?.();
      $('review-deadline').textContent = deadline;
      window.KubernautUX.schedule();
    }
  }
  function projectScopeDeadlines() {
    for (const fixture of Object.values(fixtures)) projectDeadline(feed.get(fixture.name) || fixture);
  }
  function layout() {
    const header = app.querySelector('.app-header').getBoundingClientRect(), box = app.getBoundingClientRect();
    app.style.setProperty('--ux-header-height', header.height + 'px');
    toast.style.top = Math.max(8, header.bottom + 8) + 'px'; toast.style.right = Math.max(14, innerWidth - box.right + 16) + 'px';
    toast.style.maxHeight = Math.max(120, innerHeight - Math.max(8, header.bottom + 8) - 16) + 'px';
  }
  function closePanel(focus = false) { $('notification-panel').hidden = true; $('notification-toggle').setAttribute('aria-expanded', 'false'); if (focus) $('notification-toggle').focus({ preventScroll: true }); }
  function dismissToast() { toast.hidden = true; toastKey = null; }
  function demoStatus() {
    $('notification-demo-status').textContent = `${lastMessage} Fixture polls: ${pollReads}. Toasts shown: ${toastCount}.`;
    for (const id of ['notification-queue', 'notification-poll', 'notification-resolve']) $(id).disabled = !allowed();
    $('notification-investigation').disabled = !allowed() || $('access-preview')?.value !== 'operations';
  }
  function render(state) {
    epoch = state.epoch;
    const visible = state.records.filter(record => record.notified && hrefFor(record));
    const unread = visible.filter(record => record.unread).length;
    $('notification-count').hidden = unread === 0; $('notification-count').textContent = unread > 99 ? '99+' : String(unread);
    $('notification-toggle').setAttribute('aria-label', `Notifications, ${unread} unread approval ${unread === 1 ? 'alert' : 'alerts'}`);
    $('notification-empty').hidden = visible.length > 0;
    const keys = new Set(visible.map(record => record.key));
    for (const [key, row] of rows) if (!keys.has(key)) { row.remove(); rows.delete(key); }
    for (const record of visible) {
      let row = rows.get(record.key);
      if (!row) {
        row = document.createElement('li'); row.dataset.notificationKey = record.key;
        const name = document.createElement('strong'); name.className = 'notification-name';
        const status = document.createElement('span'); status.className = 'notification-status';
        const link = document.createElement('a'); link.addEventListener('click', () => { store.read(record.key); dismissToast(); closePanel(); });
        row.append(name, status, link); $('notification-list').append(row); rows.set(record.key, row);
      }
      row.children[0].textContent = record.name;
      row.children[1].textContent = `${record.namespace} · ${record.decision}${record.unread ? ' · unread' : ''}`;
      row.children[2].textContent = record.decision === 'Pending' ? 'Open approval review →' : 'View request status →'; row.children[2].href = hrefFor(record);
    }
    const shown = state.records.find(record => record.key === toastKey);
    if (!state.active || shown && shown.decision !== 'Pending') dismissToast();
    if (!state.active) { closePanel(); live.textContent = ''; }
    demoStatus(); layout();
  }
  function notify(record) {
    if (!hrefFor(record)) return;
    toastKey = record.key; toastCount++;
    $('notification-toast-name').textContent = record.name;
    $('notification-toast-scope').textContent = `${record.namespace} · synthetic approval alert`;
    $('notification-toast-link').href = hrefFor(record);
    live.textContent = `New approval request ${record.name}. Open Notifications or the Approvals inbox to review.`;
    toast.hidden = false; layout();
  }
  const store = window.KubernautNotificationStore.createStore({ now: demoNow, onChange: render, onNotify: notify });
  function poll() {
    if (!allowed()) return Promise.resolve(false);
    const ticket = store.beginPoll(); if (!ticket) return Promise.resolve(false);
    const snapshot = [...feed.values()].filter(record => record.decision === 'Pending').map(record => ({ ...record }));
    pollReads++;
    return Promise.resolve().then(() => {
      const result = store.finishPoll(ticket, { records: snapshot, complete: true });
      if (result.accepted) { lastMessage = ticket.baseline ? 'Initial fixture list read quietly; no backlog announcement.' : 'Fixture list reconciled through the shared handler.'; demoStatus(); }
      return result.accepted;
    });
  }
  function timer() {
    if (interval) clearInterval(interval); interval = null;
    if (allowed() && timerEnabled) interval = setInterval(() => { if (!document.hidden) poll(); }, 15000);
  }
  function resetContext(reset = false) {
    if (reset) {
      signedIn = true; clockStart = performance.now(); toastCount = 0; pollReads = 0;
      window.KubernautClearDecision?.();
      reviewStates['rar-demo-02'] = 'pending';
      if (activeScreen === 'review' && activeCase === 'rar-demo-02') updateReviewState();
    }
    contextKey = activeContext(); dismissToast(); closePanel(); feed.clear();
    const ready = allowed();
    if (ready) fresh('rar-demo-01');
    projectScopeDeadlines();
    requestAnimationFrame(projectScopeDeadlines);
    store.setScope(ready ? { source, namespace, principal: 'synthetic-viewer:' + $('access-preview').value, session: 'prototype-epoch-' + (epoch + 1) } : null);
    lastMessage = ready ? 'Notification study active for this synthetic scope.' : 'Alerts disabled: signed out, historical dataset, or unavailable topology.';
    if (ready) poll(); timer(); demoStatus();
  }
  function investigation() {
    if (!allowed() || $('access-preview').value !== 'operations') return false;
    const base = fresh('rar-demo-02');
    const record = { ...base, name: namespace + '/rar-demo-02', decision: 'Pending' };
    const accepted = store.observe(record, store.capture(), 'investigation'); lastMessage = accepted ? 'Investigation signal handled; an eventual poll uses the same RAR key.' : 'Signal ignored: this example is already resolved in the notification scope.'; demoStatus(); return accepted;
  }
  function queue() { if (!allowed()) return; fresh('rar-demo-03'); lastMessage = 'Another operator’s example RAR is queued; repeated detections retain its deadline.'; demoStatus(); }
  function resolve() {
    if (!allowed()) return;
    const record = { ...fresh('rar-demo-02'), decision: 'Rejected' }; feed.set('rar-demo-02', record);
    // Reuse the baseline's existing concurrent-decision fixture, not a new decision implementation.
    window.KubernautClearDecision?.(); reviewStates['rar-demo-02'] = 'conflict';
    if (activeScreen === 'review' && activeCase === 'rar-demo-02') updateReviewState();
    store.observe(record, store.capture(), 'investigation'); lastMessage = 'A simulated decision from elsewhere updated the alert; no decision was submitted.'; demoStatus();
  }
  $('notification-toggle').addEventListener('click', () => { const open = $('notification-panel').hidden; $('notification-panel').hidden = !open; $('notification-toggle').setAttribute('aria-expanded', String(open)); if (open) $('notification-panel').querySelector('a')?.focus({ preventScroll: true }); });
  $('notification-toast-close').addEventListener('click', () => { dismissToast(); $('notification-toggle').focus({ preventScroll: true }); });
  $('notification-toast-link').addEventListener('click', () => { if (toastKey) store.read(toastKey); dismissToast(); closePanel(); });
  $('notification-inbox').addEventListener('click', () => closePanel());
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('notification-panel').hidden) { event.preventDefault(); closePanel(true); } });
  document.addEventListener('pointerdown', event => { if (!host.contains(event.target)) closePanel(); });
  window.addEventListener('hashchange', () => { closePanel(); dismissToast(); });
  window.addEventListener('resize', layout); window.addEventListener('scroll', layout, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && timerEnabled) poll(); });
  document.addEventListener('change', event => { if (['evidence-dataset', 'access-preview', 'topology'].includes(event.target.id) && activeContext() !== contextKey) resetContext(); }, true);
  $('notification-investigation').addEventListener('click', investigation); $('notification-queue').addEventListener('click', queue); $('notification-poll').addEventListener('click', poll); $('notification-resolve').addEventListener('click', resolve);
  $('notification-reset').addEventListener('click', () => resetContext(true));
  $('notification-logout').addEventListener('click', () => { signedIn = false; resetContext(); });
  $('notification-periodic').addEventListener('change', event => { timerEnabled = event.target.checked; timer(); demoStatus(); });
  window.addEventListener('pagehide', () => { if (interval) clearInterval(interval); interval = null; });
  window.KubernautNotificationStudy = Object.freeze({ store, investigation, queue, poll, resolve, reset: () => resetContext(true), logout: () => { signedIn = false; resetContext(); }, stats: () => ({ toastCount, pollReads, active: allowed(), periodic: Boolean(interval), epoch }), ready: true });
  resetContext();
})();
