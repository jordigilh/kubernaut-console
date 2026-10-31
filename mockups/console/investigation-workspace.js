/* Offline presentation/navigation only. The existing single synthetic workspace is NOT production parity. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), screen = $('screen-investigation'), heading = screen.querySelector('.page-heading');
  const thread = $('thread'), composer = $('composer'), send = $('send-message');
  const conversation = thread.closest('.card'); conversation.classList.add('workspace-conversation-card');
  conversation.querySelector('h2').textContent = 'Conversation';
  conversation.querySelector('.tiny').textContent = 'Synthetic recorded example · no agent connection';
  heading.querySelector('p').textContent = 'Existing investigation workspace · synthetic example';
  thread.tabIndex = 0; thread.setAttribute('role', 'region'); thread.setAttribute('aria-label', 'Scrollable investigation conversation');
  const label = document.createElement('label'); label.className = 'workspace-composer-label'; label.htmlFor = 'composer'; label.textContent = 'Follow-up message';
  composer.before(label); composer.setAttribute('aria-label', 'Follow-up message');
  const help = document.createElement('p'); help.id = 'workspace-composer-help'; help.className = 'workspace-composer-help';
  help.textContent = 'Enter sends this local preview · Shift+Enter adds a line. No message is sent to an agent.';
  composer.setAttribute('aria-describedby', help.id); composer.parentElement.append(help);
  const nav = document.createElement('nav'); nav.className = 'workspace-back-nav'; nav.setAttribute('aria-label', 'Return from investigation workspace');
  const back = document.createElement('a'); back.id = 'workspace-back'; nav.append(back); heading.before(nav);
  const recordedCase = [...screen.querySelectorAll('a.button[href="#case/rr-demo-02"]')].find(node => !nav.contains(node));
  if (recordedCase) { recordedCase.classList.add('workspace-record-link'); recordedCase.textContent = 'Open recorded case →'; screen.querySelector('.workspace-layout>aside .card').append(recordedCase); }
  const controls = document.createElement('label'); controls.id = 'workspace-study-control'; controls.hidden = true;
  controls.innerHTML = 'Conversation example <select id="workspace-thread-example"><option value="brief">Brief</option><option value="long">Long layout sample</option></select>';
  document.querySelector('.preview-tools').append(controls);
  const nonce = crypto.randomUUID(); let pendingOrigin = null, currentOrigin = null, sizeGeneration = 0;
  const scope = () => JSON.stringify(window.KubernautUX.context());
  const route = () => { const [path] = location.hash.slice(1).split('?'); const [screen, id] = path.split('/'); return { screen, id }; };
  const validWorkspace = () => activeScreen === 'investigation' && !screen.hidden && Boolean(window.KubernautFixtureContext.workspaceForRoute(route().id));
  function scheduleSize() {
    const generation = ++sizeGeneration;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== sizeGeneration || !validWorkspace()) return;
      const top = conversation.getBoundingClientRect().top, minimum = innerWidth <= 620 ? 440 : 420;
      conversation.style.setProperty('--workspace-panel-height', Math.max(minimum, Math.min(680, innerHeight - top - 20)) + 'px');
      screen.dataset.workspaceLayoutReady = $('app').dataset.uxReady;
    }));
  }
  function originFor(hash) {
    const path = hash.split('?')[0];
    const labels = { '#overview': 'overview', '#investigations': 'cases', '#approvals': 'approvals', '#case/rr-demo-02': 'recorded case', '#review/rar-demo-02': 'approval review' };
    return Object.hasOwn(labels, path) ? { href: hash, label: labels[path] } : null;
  }
  function returnToOrigin(minimize) {
    if (!validWorkspace() || !currentOrigin) return;
    if (minimize) $('dock').hidden = false;
    if (currentOrigin.nonce === nonce && currentOrigin.canGoBack) history.back();
    else location.hash = currentOrigin.href;
  }
  function render() {
    const available = validWorkspace(); controls.hidden = !available;
    if (!available) { pendingOrigin = null; currentOrigin = null; sizeGeneration++; delete screen.dataset.workspaceLayoutReady; return; }
    const candidate = pendingOrigin || history.state?.knWorkspaceOrigin;
    pendingOrigin = null;
    currentOrigin = candidate && candidate.scope === scope() && originFor(candidate.href) ? candidate : { href: '#case/rr-demo-02', label: 'recorded case', scope: scope(), canGoBack: false };
    history.replaceState({ ...history.state, knWorkspaceOrigin: currentOrigin }, '');
    back.href = currentOrigin.href; back.textContent = '← Back to ' + currentOrigin.label;
    $('minimize').title = 'Keep this workspace available while browsing; no cancellation';
    if ($('workspace-state-note')) $('workspace-state-note').dataset.mode = $('workspace-preview').value;
    scheduleSize();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (plain && link?.getAttribute('href') === '#investigation/rr-demo-02') {
      const origin = originFor(location.hash);
      if (origin) pendingOrigin = { ...origin, scope: scope(), nonce, canGoBack: true };
    }
    if (plain && link === back && validWorkspace()) { event.preventDefault(); returnToOrigin(false); }
    if (event.target.closest('#minimize') && validWorkspace()) {
      // Replace only the legacy prototype's hard-coded Approvals navigation, not an operational handler.
      event.preventDefault(); event.stopImmediatePropagation(); returnToOrigin(true);
    }
  }, true);
  composer.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (validWorkspace() && !send.disabled && composer.value.trim()) send.click();
  });
  send.addEventListener('click', () => {
    if (!validWorkspace() || send.disabled) return;
    thread.scrollTop = thread.scrollHeight; composer.focus({ preventScroll: true });
  });
  function example(value) {
    thread.querySelectorAll('.workspace-layout-sample').forEach(node => node.remove());
    if (value === 'long') for (let i = 1; i <= 12; i++) {
      const message = document.createElement('div'); message.className = 'message workspace-layout-sample';
      const who = document.createElement('span'); who.className = 'speaker'; who.textContent = 'Synthetic layout sample ' + i;
      message.append(who, document.createTextNode('Long-conversation layout example only. This is not additional incident evidence, provider reasoning or an AF response. Use the scrollable thread without losing the follow-up composer.'));
      thread.append(message);
    }
    thread.scrollTop = 0;
  }
  $('workspace-thread-example').addEventListener('change', event => { example(event.target.value); window.KubernautUX.schedule(); });
  window.addEventListener('hashchange', render);
  document.addEventListener('change', event => { if (['evidence-dataset', 'access-preview', 'topology', 'ux-case-volume', 'workspace-preview'].includes(event.target.id)) { pendingOrigin = null; render(); } });
  window.addEventListener('resize', scheduleSize);
  window.KubernautInvestigationStudy = Object.freeze({ ready: true, render, example });
  render(); window.KubernautUX.schedule();
})();
