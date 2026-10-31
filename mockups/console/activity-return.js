/* Offline presentation: settle an explicit Activity return after residual scroll. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app = $('app'), grid = $('rail-workspace'), panel = $('case-summary');
  const thread = $('thread'), rca = $('compact-rca'), workflows = $('gitops-workflows');
  const composer = $('composer'), resizer = $('rail-resizer'), caseDetails = $('case-details-disclosure');
  const summaryScroll = $('rail-summary-scroll');
  const execute = workflows.querySelector('.gitops-execute');
  let share = 20, mobile = innerWidth <= 699, lastMobile = null, mobileDetailsOpen = false;
  let drag = null, findingsView = true, initialized = false;
  const stages = { investigating: 'Investigating', review: 'Workflow review', selected: 'Workflow chosen', executing: 'Executing · example', assessing: 'Assessing', assessed: 'Assessed · example' };
  const tokens = {
    reported: { input: 1200, output: 450, total: 1650, available: true },
    pending: { pending: true }, unavailable: {}, partial: { input: 1200 },
    zero: { input: 0, output: 0, total: 0, available: true },
  };
  // Separate explicit fixture fields: never derive target namespace from the alert.
  const scopes = {
    baseline: { source: { cluster: null, namespace: 'demo-webui', resource: 'Pod/web-frontend-example' }, target: { cluster: null, namespace: 'demo-webui', resource: 'ConfigMap/app-config' } },
    different: { source: { cluster: 'spoke-example', namespace: 'demo-webui', resource: 'Pod/web-frontend-example' }, target: { cluster: 'control-example', namespace: 'gitops-example', resource: 'Application/web-frontend' } },
    missing: { source: { cluster: 'spoke-example', namespace: 'demo-webui', resource: 'Pod/web-frontend-example' }, target: { cluster: null, namespace: null, resource: 'ConfigMap/app-config' } },
  };
  const chosen = document.createElement('span');
  chosen.className = 'rail-selection-tag'; chosen.textContent = 'Chosen'; chosen.hidden = true;
  workflows.querySelector('.gitops-card-heading').append(chosen);
  const pending = document.createElement('div');
  pending.id = 'rail-investigating-message'; pending.className = 'rail-investigating';
  pending.setAttribute('role', 'region'); pending.setAttribute('aria-label', 'Agent activity');
  pending.tabIndex = -1;
  pending.innerHTML = `<div class="activity-heading"><div id="activity-status" role="status" aria-live="polite" aria-atomic="true"><span class="activity-dot" aria-hidden="true"></span><strong id="activity-phase"></strong></div><span id="activity-clock" class="activity-clock"></span></div>
    <p id="activity-current"></p><p class="activity-fixture-note">Illustrative activity · no live stream</p>
    <details id="activity-details"><summary id="activity-details-label">Activity events</summary><p class="activity-source-note">Selected public status/tool events · example receipt times in UTC. No raw reasoning or tool payloads.</p><ol id="activity-events"></ol><p id="investigation-duration"></p></details>
    <section id="verification-progress" aria-labelledby="verification-heading" hidden><div class="activity-heading"><h3 id="verification-heading">Verification</h3><span id="verification-clock" class="activity-clock"></span></div><p id="verification-window"></p><details id="verification-details" open><summary>Reported verification steps</summary><ol id="verification-events"></ol></details><p class="activity-source-note">A completed check is not independent proof of recovery. The supplied window is not a recovery ETA.</p></section>`;
  thread.querySelector('.message.user').after(pending);
  const frameStatus = document.createElement('span');
  frameStatus.id = 'activity-frame-status'; frameStatus.className = 'activity-frame-status';
  frameStatus.setAttribute('aria-live', 'off');
  $('conversation-ai-identity').append(frameStatus);
  const frameActivity = document.createElement('div');
  frameActivity.className = 'frame-activity';
  frameActivity.innerHTML = '<span id="frame-activity-context" aria-live="off"></span><button type="button" id="activity-return" aria-controls="rail-investigating-message" aria-label="Show agent activity and timing">Activity ↑</button>';
  $('conversation-ai-identity').append(frameActivity);
  let advancedSeconds = 0, previousInvestigationState = null, previousVerificationState = null;
  let pendingActivityReturn = null;
  const epoch = Date.parse('2026-10-30T10:00:00Z');
  const at = seconds => epoch + seconds * 1000;
  const validTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
  const duration = (start, end) => validTime(start) && validTime(end) && end >= start ? Math.floor((end - start) / 1000) : null;
  const formatDuration = seconds => seconds === null ? 'Not available' : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
  // Render only public, already-sanitized status/narration/tool labels. The
  // real projection still needs qualification; raw reasoning is never shown.
  const safeEntries = entries => (Array.isArray(entries) ? entries : []).filter(entry =>
    entry && ['status', 'investigation', 'preflight', 'tool_call'].includes(entry.type) && typeof entry.text === 'string');
  function exampleSnapshot() {
    const stage = $('rail-preview-stage').value, scene = $('activity-preview').value;
    const investigationEnd = stage === 'investigating' ? null : at(84);
    const snapshots = {
      investigating: { phase: 'Investigating', taskLabel: 'Tool · health probes', current: 'Tool activity · inspecting workload configuration and health probes', working: true, observedAt: at(38) },
      review: { phase: 'Decision pending', taskLabel: 'Awaiting operator', current: 'RCA available · awaiting workflow choice. The AI is not currently working.', working: false, observedAt: at(84) },
      selected: { phase: 'Decision pending', taskLabel: 'Chosen, not executed', current: 'Workflow chosen · not executed. The AI is not currently working.', working: false, observedAt: at(90) },
      executing: { phase: 'Executing', taskLabel: 'Workflow execution', current: 'Workflow execution reported in progress · not a recovery result.', working: true, observedAt: at(102), phaseStart: at(96) },
      assessing: { phase: 'Verifying', taskLabel: 'Stabilization checks', current: 'Execution finished · waiting for reported stabilization and assessment checks.', working: true, observedAt: at(138), phaseStart: at(120) },
      assessed: { phase: 'Assessment recorded', taskLabel: 'Assessment recorded', current: 'Assessment finished · separate signal-resolution result is not supplied.', working: false, observedAt: at(198), phaseStart: at(120), phaseEnd: at(198) },
    };
    const snapshot = { ...snapshots[stage], stage, scene, investigationState: stage === 'investigating' ? 'running' : 'completed', phaseState: stage === 'assessed' ? 'completed' : 'in_progress', connection: 'connected', start: at(0), end: investigationEnd, entries: [
      { type: 'status', text: 'Investigation accepted', observedAt: at(0) },
      { type: 'tool_call', text: 'Inspect workload configuration', observedAt: at(8) },
      { type: 'status', text: 'AI analysis · reviewing tool results', observedAt: at(21) },
      { type: 'tool_call', text: 'Inspect health probes', observedAt: at(31) },
    ] };
    if (scene === 'llm') {
      snapshot.observedAt = at(26); snapshot.taskLabel = 'AI analysis · tool results'; snapshot.current = 'AI analysis · reviewing tool results'; snapshot.entries = snapshot.entries.slice(0, 3);
    }
    if (['reconnecting', 'disconnected', 'failed', 'timed-out', 'cancelled'].includes(scene)) {
      snapshot.working = false; snapshot.connection = scene === 'reconnecting' ? 'reconnecting' : 'paused'; snapshot.observedAt = at(38);
      snapshot.investigationState = 'unknown'; snapshot.taskLabel = 'Task updates unavailable';
      const descriptions = {
        reconnecting: ['Updates paused', 'Chat stream reconnecting · last observed phase: Investigating. No new activity is confirmed.'],
        disconnected: ['Updates paused', 'Chat connection lost · investigation may still be running. Cached text does not restore the live driver.'],
        failed: ['Response failed', 'The investigation response failed · incident outcome is not supplied.'],
        'timed-out': ['Response timed out', 'The response timed out · this does not establish the remediation request outcome.'],
        cancelled: ['Response interrupted', 'The response was interrupted · this is not cancellation of the remediation request.'],
      };
      [snapshot.phase, snapshot.current] = descriptions[scene];
    }
    if (scene === 'missing') { snapshot.start = null; snapshot.end = null; snapshot.phaseStart = null; snapshot.phaseEnd = null; }
    if (scene === 'zero') { snapshot.observedAt = at(0); snapshot.taskLabel = 'Investigation accepted'; snapshot.entries = snapshot.entries.slice(0, 1); snapshot.current = 'Investigation accepted · explicit zero elapsed time supplied.'; }
    if (scene === 'retry') { snapshot.observedAt = at(186); snapshot.taskLabel = 'Alert check · retry 3'; snapshot.current = 'Verification · alert check retry reported. No recovery result yet.'; }
    if (snapshot.working && snapshot.connection === 'connected') snapshot.observedAt += advancedSeconds * 1000;
    if (['assessing', 'assessed'].includes(stage)) {
      snapshot.verification = {
        state: stage === 'assessed' ? 'completed' : 'in_progress', start: snapshot.phaseStart, end: snapshot.phaseEnd ?? null, windowSeconds: 60,
        steps: stage === 'assessed' ? [
          { step: 'Stabilization window', status: 'completed', elapsed: 60 },
          { step: 'Spec hash verification', status: 'completed', elapsed: 2 },
          { step: 'Alert decay check', status: 'completed', elapsed: 4 },
          { step: 'Health assessment', status: 'completed', elapsed: 6 },
        ] : scene === 'retry' ? [
          { step: 'Stabilization window', status: 'completed', elapsed: 60 },
          { step: 'Spec hash verification', status: 'completed', elapsed: 2 },
          { step: 'Alert decay check', status: 'in_progress', retryCount: 3, elapsed: 6 },
          { step: 'Health assessment', status: 'not_reported' },
        ] : [
          { step: 'Stabilization window', status: 'in_progress' },
          { step: 'Spec hash verification', status: 'not_reported' },
          { step: 'Alert decay check', status: 'not_reported' },
          { step: 'Health assessment', status: 'not_reported' },
        ],
      };
    }
    return snapshot;
  }
  function renderProgress(snapshot = exampleSnapshot()) {
    const busy = snapshot.working === true && snapshot.connection === 'connected';
    // Lifecycle is explicitly supplied. Timing may be missing, zero or invalid
    // without reopening completed work or turning a duration into elapsed time.
    const completed = snapshot.investigationState === 'completed';
    pending.dataset.busy = String(busy); pending.dataset.connection = snapshot.connection;
    frameStatus.dataset.busy = String(busy); frameStatus.textContent = snapshot.phase;
    frameStatus.setAttribute('aria-label', `Illustrative phase: ${snapshot.phase}`);
    frameStatus.title = 'Example phase/activity state, not live telemetry';
    $('activity-phase').textContent = busy ? snapshot.stage === 'investigating' ? 'Agent working' : snapshot.stage === 'executing' ? 'Workflow running' : 'Verification running' : completed ? 'Investigation finished' : snapshot.phase;
    $('activity-current').textContent = snapshot.current;
    const investigationSeconds = duration(snapshot.start, completed ? snapshot.end : snapshot.observedAt);
    const phaseSeconds = duration(snapshot.phaseStart, snapshot.phaseState === 'completed' ? snapshot.phaseEnd : snapshot.observedAt);
    const paused = snapshot.connection !== 'connected';
    $('activity-clock').textContent = ['executing', 'assessing', 'assessed'].includes(snapshot.stage)
      ? `${snapshot.stage === 'executing' ? 'Execution elapsed' : snapshot.stage === 'assessed' ? 'Verification duration' : 'Verification elapsed'}: ${formatDuration(phaseSeconds)}`
      : `${paused ? 'Last observed elapsed' : completed ? 'Investigation duration' : 'Investigation elapsed'}: ${formatDuration(investigationSeconds)}`;
    $('investigation-duration').textContent = `${completed ? 'Investigation duration' : paused ? 'Last observed investigation elapsed' : 'Investigation elapsed'}: ${formatDuration(investigationSeconds)} · example browser-observed timing`;
    const phaseClock = ['executing', 'assessing', 'assessed'].includes(snapshot.stage);
    const compactSeconds = phaseClock ? phaseSeconds : investigationSeconds;
    const compactQualifier = paused ? 'last observed' : snapshot.phaseState === 'completed' ? 'verification duration' : phaseClock ? 'elapsed' : completed ? 'investigation duration' : 'elapsed';
    $('frame-activity-context').textContent = `${snapshot.taskLabel || 'Task not supplied'} · ${formatDuration(compactSeconds)} ${compactQualifier}`;
    $('frame-activity-context').title = 'Illustrative safe task and qualified timing. Use Activity for full context; no live stream.';
    const entries = safeEntries(snapshot.entries), list = $('activity-events'); list.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('li'), text = document.createElement('span');
      if (validTime(entry.observedAt)) {
        const time = document.createElement('time'); time.dateTime = new Date(entry.observedAt).toISOString();
        time.textContent = new Date(entry.observedAt).toISOString().slice(11, 19) + 'Z'; item.append(time);
      }
      text.textContent = entry.text; item.append(text); list.append(item);
    }
    if (!entries.length) { const item = document.createElement('li'); item.textContent = 'No public activity entries supplied.'; list.append(item); }
    $('activity-details-label').textContent = `Activity · ${entries.length} selected example events`;
    if (previousInvestigationState !== snapshot.investigationState) $('activity-details').open = !completed;
    previousInvestigationState = snapshot.investigationState;
    const verification = snapshot.verification;
    $('verification-progress').hidden = !verification;
    if (verification) {
      const verificationComplete = verification.state === 'completed';
      const elapsed = duration(verification.start, verificationComplete ? verification.end : snapshot.observedAt);
      $('verification-clock').textContent = `${verificationComplete ? 'Duration' : 'Elapsed'}: ${formatDuration(elapsed)}`;
      const window = verification.windowSeconds;
      $('verification-window').textContent = elapsed === null || !Number.isFinite(window) || window <= 0
        ? 'Stabilization timing not available.'
        : elapsed < window ? `Stabilization: ${elapsed}s of supplied ${window}s window · ${window - elapsed}s remaining in that window.`
          : 'Supplied stabilization window elapsed · completion depends on reported checks, not the clock.';
      const steps = $('verification-events'); steps.replaceChildren();
      const statusLabels = { completed: 'Reported complete', in_progress: 'Reported in progress', failed: 'Reported failed', not_reported: 'Not reported' };
      for (const step of verification.steps) {
        const item = document.createElement('li'); item.dataset.status = step.status;
        const name = document.createElement('strong'); name.textContent = step.step;
        const status = document.createElement('span'); status.textContent = statusLabels[step.status] || 'Unknown reported status';
        if (Number.isSafeInteger(step.retryCount) && step.retryCount > 1) status.textContent += ` · retry ${step.retryCount}`;
        if (typeof step.elapsed === 'number' && Number.isFinite(step.elapsed) && step.elapsed >= 0) status.textContent += ` · +${step.elapsed}s`;
        item.append(name, status); steps.append(item);
      }
      if (previousVerificationState !== verification.state) $('verification-details').open = !verificationComplete;
      previousVerificationState = verification.state;
    } else {
      previousVerificationState = null;
    }
    $('activity-advance').disabled = !busy || !validTime(snapshot.start) || (snapshot.verification && !validTime(snapshot.verification.start));
  }
  const value = item => item === null || item === undefined ? 'Not supplied' : item;
  const hasRca = () => $('rail-preview-stage').value !== 'investigating';

  function renderScopes() {
    const example = scopes[$('scope-preview').value] || scopes.baseline;
    for (const [prefix, scope] of [['alert-source', example.source], ['rca-target', example.target]]) {
      for (const field of ['cluster', 'namespace', 'resource']) $(prefix + '-' + field).textContent = value(scope[field]);
    }
    $('rail-signal-target').textContent = example.source.resource;
    $('rr-details-source-cluster').textContent = value(example.source.cluster);
    $('rr-details-source-namespace').textContent = value(example.source.namespace);
    $('card-rca-target').textContent = `RCA target: ${example.target.resource} · Namespace: ${value(example.target.namespace)} · Cluster: ${value(example.target.cluster)}`;
    $('mobile-source-resource').textContent = example.source.resource;
    $('mobile-source-scope').textContent = `${value(example.source.namespace)} · Cluster: ${value(example.source.cluster)}`;
    $('mobile-target-resource').textContent = hasRca() ? example.target.resource : 'Not yet identified';
    $('mobile-target-scope').textContent = hasRca() ? `${value(example.target.namespace)} · Cluster: ${value(example.target.cluster)}` : 'Investigation in progress';
  }
  function renderTokens() {
    const example = tokens[$('token-preview').value] || tokens.unavailable;
    const waiting = !hasRca() || example.pending;
    const available = !waiting && example.available && [example.input, example.output, example.total].every(n => Number.isSafeInteger(n) && n >= 0);
    const format = n => n.toLocaleString('en-US');
    const state = waiting ? 'pending' : available ? 'available' : 'unavailable';
    const absent = waiting ? 'Tokens: Awaiting metrics' : 'Tokens: Not available';
    const split = available ? `${format(example.input)} in / ${format(example.output)} out` : '';
    $('rca-token-usage-text').textContent = available ? `Tokens: ${format(example.total)} (${split})` : absent;
    $('rail-rca-token-total').textContent = available ? `Tokens: ${format(example.total)} total` : absent;
    $('rail-rca-token-split').textContent = split; $('rail-rca-token-split').hidden = !available;
    $('mobile-token-usage').textContent = available ? `RCA tokens: ${split} · example` : absent;
    for (const id of ['rca-token-example', 'rail-rca-token-example']) $(id).hidden = !available;
    for (const id of ['rca-token-metrics', 'rail-rca-usage', 'mobile-token-usage']) $(id).dataset.state = state;
    $('rail-rca-usage').hidden = !hasRca(); $('rail-ai-provenance').hidden = !hasRca();
    $('mobile-token-usage').hidden = !hasRca();
  }
  function syncSizes() {
    const header = document.querySelector('.app-header').getBoundingClientRect().height;
    app.style.setProperty('--ux-header-height', header + 'px');
    if (mobile) {
      app.style.setProperty('--mobile-composer-space', document.querySelector('.composer').getBoundingClientRect().height + 'px');
      app.style.setProperty('--mobile-identity-space', $('conversation-ai-identity').getBoundingClientRect().height + 'px');
      app.style.setProperty('--mobile-summary-height', panel.getBoundingClientRect().height + 'px');
      // Expanded summary is normal flow: it reserves no pinned header offset.
      app.style.setProperty('--mobile-pinned-summary-height', (caseDetails.open ? 0 : panel.getBoundingClientRect().height) + 'px');
    } else grid.style.setProperty('--rail-height', Math.max(360, innerHeight - grid.getBoundingClientRect().top - 14) + 'px');
  }
  function bounds() {
    const width = grid.getBoundingClientRect().width;
    // Reserve a readable 240px conversation plus the 10px grid gap.
    // A fixed 30% cap previously left tablets with an empty resize range.
    const min = 180 / width * 100;
    const max = Math.min(360, width - 250) / width * 100;
    return { min, max };
  }
  function resizeSummary(requested) {
    if (mobile) return;
    const range = bounds(); share = Math.max(range.min, Math.min(range.max, requested));
    grid.style.setProperty('--rail-width', share + '%');
    const actual = panel.getBoundingClientRect().width / grid.getBoundingClientRect().width * 100;
    resizer.setAttribute('aria-valuemin', range.min.toFixed(1));
    resizer.setAttribute('aria-valuemax', range.max.toFixed(1));
    resizer.setAttribute('aria-valuenow', actual.toFixed(1));
    resizer.setAttribute('aria-valuetext', `${Math.round(panel.getBoundingClientRect().width)} pixels, ${actual.toFixed(1)} percent`);
    resizer.setAttribute('aria-disabled', String(range.max - range.min < 0.1));
    resizer.tabIndex = range.max - range.min < 0.1 ? -1 : 0;
  }
  function layout() {
    mobile = innerWidth <= 699; app.dataset.mobileLayout = String(mobile);
    panel.hidden = false; resizer.hidden = mobile;
    resizer.setAttribute('aria-hidden', String(mobile));
    // Native details creates an internal content box that defeated the old
    // desktop flex constraint. Make the scroller a direct flex child there;
    // put the same node back inside the native disclosure on phones.
    const parent = mobile ? caseDetails : panel;
    if (summaryScroll.parentElement !== parent) parent.append(summaryScroll);
    caseDetails.hidden = !mobile;
    if (lastMobile !== mobile) {
      if (mobile) caseDetails.open = mobileDetailsOpen;
      else { if (lastMobile === true) mobileDetailsOpen = caseDetails.open; caseDetails.open = true; }
      $('prototype-controls').open = !mobile;
    }
    if (mobile) resizer.tabIndex = -1; else resizeSummary(share);
    $('gitops-composer-help').textContent = mobile ? 'Local draft · actions disabled.' : 'Local draft only. No agent request, execution or approval is submitted.';
    lastMobile = mobile; syncSizes();
  }
  function navigate(node) {
    if (mobile && caseDetails.open && node.closest('.rail-conversation')) {
      caseDetails.open = false; mobileDetailsOpen = false; syncSizes();
    }
    node.focus({ preventScroll: true });
    if (mobile) {
      const offset = panel.getBoundingClientRect().height + document.querySelector('.conversation-ai-header').getBoundingClientRect().height + 8;
      window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - offset, behavior: 'instant' });
    } else thread.scrollTop += node.getBoundingClientRect().top - thread.getBoundingClientRect().top - 10;
  }
  function keepFocusedControlVisible(target) {
    if (!mobile || document.activeElement !== target || target === thread || target === summaryScroll) return;
    const inConversation = Boolean(target.closest('#thread'));
    const inExpandedContext = caseDetails.open && Boolean(target.closest('#rail-summary-scroll'));
    if (!inConversation && !inExpandedContext) return;
    const top = inExpandedContext ? 8 : (caseDetails.open ? 0 : panel.getBoundingClientRect().height) + $('conversation-ai-identity').getBoundingClientRect().height + 8;
    const bottom = Math.min(innerHeight, document.querySelector('.composer').getBoundingClientRect().top) - 8;
    if (bottom <= top) return;
    let anchor = target;
    if (target === pending) anchor = pending.querySelector('.activity-heading');
    if (anchor.getBoundingClientRect().height > bottom - top) {
      anchor = target.querySelector('.gitops-card-heading') || anchor;
    }
    const box = anchor.getBoundingClientRect();
    const delta = box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy({ top: delta, behavior: 'instant' });
      return true;
    }
    return false;
  }
  function settleFocusedControl(target = document.activeElement) {
    // Native Tab/Shift+Tab can auto-scroll after focus dispatch. Correct only
    // the still-focused control after that layout, without replacing focus.
    requestAnimationFrame(() => requestAnimationFrame(() => keepFocusedControlVisible(target)));
  }
  function showRca(evidence = false) {
    if (!hasRca()) return;
    findingsView = true; $('rail-thread-position').textContent = '↓ Workflow options';
    if (evidence) $('gitops-evidence').open = true;
    navigate(evidence ? $('gitops-evidence') : $('gitops-rca-title'));
  }
  function showWorkflows() {
    if (workflows.hidden) return;
    findingsView = false; $('rail-thread-position').textContent = '↑ RCA findings';
    navigate(workflows);
  }
  function showActivity() {
    navigate(pending);
    // An instant jump can precede residual compositor wheel movement. Retain
    // this ONE explicit navigation intent for the real scroll end, rather
    // than guessing a delay or continuously anchoring ordinary reading.
    pendingActivityReturn = mobile ? pending : null;
  }
  function cancelActivityReturn() { pendingActivityReturn = null; }
  function finishActivityReturn(event) {
    if (event.target !== document && event.target !== document.scrollingElement) return;
    const target = pendingActivityReturn;
    if (!target) return;
    if (!mobile || document.activeElement !== target) { cancelActivityReturn(); return; }
    // The jump itself can also emit scrollend while the target is already
    // visible. Do not consume the intent until an occluded target is repaired
    // or a new user/focus/view intent cancels it.
    if (keepFocusedControlVisible(target)) cancelActivityReturn();
  }
  function setStage() {
    cancelActivityReturn();
    const stage = $('rail-preview-stage').value, investigating = stage === 'investigating';
    const selected = ['selected', 'executing', 'assessing', 'assessed'].includes(stage), executed = ['assessing', 'assessed'].includes(stage);
    grid.dataset.stage = stage; $('rail-phase').textContent = stages[stage];
    pending.hidden = false; rca.hidden = investigating; workflows.hidden = investigating; chosen.hidden = !selected;
    $('rail-rca-summary').textContent = investigating ? 'Investigation in progress' : 'Configuration port mismatch';
    $('rail-rca-detail').textContent = investigating ? 'RCA not yet identified.' : 'App listens on 8443; health probes expect 8080.';
    $('rail-rca-target').hidden = investigating; $('rail-rca-evidence').hidden = investigating;
    $('rail-workflow-state').textContent = investigating ? 'Awaiting discovery' : stage === 'executing' ? 'Execution in progress' : executed ? 'Executed · ' + (stage === 'assessed' ? 'assessed' : 'assessing') : selected ? 'Selected · not executed' : 'Recommended · not selected';
    $('rail-workflow-name').textContent = investigating ? 'No workflow chosen' : 'git-revert-v2';
    $('rail-workflow-version').hidden = investigating; $('rail-workflow-reference').hidden = investigating;
    $('rail-effectiveness-score').textContent = stage === 'assessed' ? '0.92 / 1.00' : stage === 'assessing' ? 'Assessing…' : 'Not assessed';
    $('rail-effectiveness-score').dataset.measured = String(stage === 'assessed');
    $('rail-effectiveness-note').textContent = stage === 'assessed' ? 'Illustrative assessment score. Separate signal-resolution result is not supplied.' : stage === 'assessing' ? 'Verification is in progress. No final score yet.' : 'No assessment result yet.';
    $('mobile-workflow-state').textContent = investigating ? 'Workflow: awaiting discovery' : `${$('rail-workflow-state').textContent} · git-revert-v2 / 1.0.0`;
    $('mobile-assessment-state').textContent = 'Effectiveness: ' + $('rail-effectiveness-score').textContent;
    execute.textContent = stage === 'executing' ? 'Executing · example' : executed ? 'Executed' : 'Execute'; execute.disabled = true;
    $('rail-thread-position').disabled = investigating;
    renderScopes(); renderTokens(); renderProgress(); syncSizes();
    if (!initialized) { thread.scrollTop = 0; initialized = true; }
  }
  $('rail-rca-evidence').addEventListener('click', () => showRca(true));
  $('activity-return').addEventListener('click', showActivity);
  document.addEventListener('scrollend', finishActivityReturn);
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    document.addEventListener(type, cancelActivityReturn, { capture: true, passive: true });
  }
  document.addEventListener('focusin', event => {
    if (pendingActivityReturn && event.target !== pendingActivityReturn) cancelActivityReturn();
  });
  addEventListener('resize', cancelActivityReturn);
  thread.addEventListener('focusin', event => settleFocusedControl(event.target));
  thread.addEventListener('toggle', () => settleFocusedControl(), true);
  panel.addEventListener('focusin', event => settleFocusedControl(event.target));
  $('rail-thread-position').addEventListener('click', () => findingsView ? showWorkflows() : showRca(false));
  $('rail-preview-stage').addEventListener('change', () => { $('activity-preview').value = 'stage'; advancedSeconds = 0; setStage(); });
  $('activity-preview').addEventListener('change', () => {
    const scene = $('activity-preview').value;
    if (['llm', 'reconnecting', 'disconnected', 'failed', 'timed-out', 'cancelled', 'zero'].includes(scene)) $('rail-preview-stage').value = 'investigating';
    if (scene === 'retry') $('rail-preview-stage').value = 'assessing';
    advancedSeconds = 0; setStage();
  });
  $('activity-advance').addEventListener('click', () => { advancedSeconds += 5; renderProgress(); syncSizes(); });
  $('rail-preview-theme').addEventListener('change', event => { app.dataset.theme = event.target.value; });
  $('token-preview').addEventListener('change', () => { renderTokens(); syncSizes(); });
  $('scope-preview').addEventListener('change', () => { renderScopes(); syncSizes(); });
  caseDetails.addEventListener('toggle', () => {
    if (mobile) mobileDetailsOpen = caseDetails.open;
    syncSizes();
    if (!mobile || !caseDetails.open) return;
    requestAnimationFrame(() => {
      if (!mobile || !caseDetails.open) return;
      const trigger = caseDetails.querySelector('summary').getBoundingClientRect();
      const bottom = innerHeight - document.querySelector('.composer').getBoundingClientRect().height;
      // Opening while pinned must reveal the trigger AND the new details,
      // rather than leaving both above the viewport after the sticky switch.
      if (trigger.top < 8 || trigger.bottom + Math.min(180, innerHeight * 0.3) > bottom) {
        window.scrollTo({ top: scrollY + trigger.top - 8, behavior: 'instant' });
      }
    });
  });
  resizer.addEventListener('keydown', event => {
    const range = bounds();
    const options = { ArrowLeft: share + 2, ArrowRight: share - 2, Home: range.min, End: range.max };
    if (!mobile && Object.hasOwn(options, event.key)) { event.preventDefault(); resizeSummary(options[event.key]); syncSizes(); }
  });
  resizer.addEventListener('pointerdown', event => {
    if (mobile || event.button !== 0 || resizer.getAttribute('aria-disabled') === 'true') return;
    drag = event.pointerId; resizer.setPointerCapture(drag); event.preventDefault();
  });
  resizer.addEventListener('pointermove', event => {
    if (drag !== event.pointerId) return;
    const box = grid.getBoundingClientRect(); resizeSummary((box.right - event.clientX) / box.width * 100); syncSizes();
  });
  function endDrag(event) { if (drag !== event.pointerId) return; if (resizer.hasPointerCapture(drag)) resizer.releasePointerCapture(drag); drag = null; }
  resizer.addEventListener('pointerup', endDrag); resizer.addEventListener('pointercancel', endDrag);
  composer.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) event.preventDefault(); });
  composer.addEventListener('input', () => { if (mobile) { composer.style.height = '40px'; composer.style.height = Math.min(96, Math.max(40, composer.scrollHeight)) + 'px'; syncSizes(); } });
  $('mobile-menu')?.addEventListener('click', event => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
    event.currentTarget.setAttribute('aria-expanded', String(expanded)); $('console-nav')?.setAttribute('aria-expanded', String(expanded)); syncSizes();
  });
  new ResizeObserver(syncSizes).observe(panel);
  new ResizeObserver(syncSizes).observe(document.querySelector('.composer'));
  new ResizeObserver(syncSizes).observe($('conversation-ai-identity'));
  addEventListener('resize', layout);
  layout(); setStage();
  window.SummaryRailMock = Object.freeze({ ready: true, showWorkflows, showEvidence: () => showRca(true) });
  window.ProgressMock = Object.freeze({ ready: true, duration, safeEntries, exampleSnapshot, renderFixture: snapshot => { renderProgress(snapshot); syncSizes(); } });
})();
