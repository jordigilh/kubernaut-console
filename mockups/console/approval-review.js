/* Prototype-only presentation/navigation. No read, workflow selection, run or decision submission. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), context = window.KubernautApprovalContext;
  const screen = $('screen-review'), layout = screen.querySelector('.detail-layout');
  const oldPanel = screen.querySelector('.decision-panel'), decision = document.createElement('section');
  decision.className = oldPanel.className; decision.setAttribute('aria-labelledby', 'decision-heading');
  decision.append(...oldPanel.childNodes); oldPanel.replaceWith(decision); layout.prepend(decision);
  const title = decision.querySelector('h2'); title.id = 'decision-heading'; title.textContent = 'Review and decide';
  // Retain original immutable-confirmation source IDs, but remove their redundant visible row.
  screen.querySelector('.context-grid').hidden = true;
  screen.querySelector('.context-grid').setAttribute('aria-hidden', 'true');
  const proposal = document.createElement('div'); proposal.className = 'review-proposal';
  const name = $('workflow-name'), label = name.previousElementSibling, snapshotNote = name.nextElementSibling;
  const rationale = $('workflow-rationale');
  snapshotNote.textContent = 'Recorded recommendation; exact parameter values are not supplied by this example read.';
  proposal.append(label, name, rationale, snapshotNote); title.after(proposal);
  const proposalVersion = document.createElement('dl'); proposalVersion.className = 'review-workflow-version';
  proposalVersion.innerHTML = '<dt class="label">Workflow version</dt><dd id="approval-workflow-version"></dd>';
  name.after(proposalVersion);
  const risk = document.createElement('p'); risk.className = 'review-essential-risk';
  risk.textContent = 'Temporary mitigation, not a correction of memory growth. The prior intervention was applied, but the signal remained unresolved and effectiveness was 0.00.';
  proposal.append(risk);
  const workflowNote = document.createElement('p'); workflowNote.id = 'approval-workflow-note'; workflowNote.className = 'review-workflow-note';
  proposal.append(workflowNote);
  const reviewer = document.createElement('div'); reviewer.className = 'reviewer-context';
  const reviewerLabel = [...decision.children].find(node => node.matches('span.label'));
  const reviewerName = reviewerLabel.nextElementSibling, reviewerHelp = reviewerName.nextElementSibling;
  reviewer.append(reviewerLabel, reviewerName, reviewerHelp); proposal.after(reviewer);
  const supporting = $('panel-workflow').closest('.card'); supporting.classList.add('review-supporting');
  const supportTitle = document.createElement('h2'); supportTitle.textContent = 'Supporting context'; supporting.prepend(supportTitle);
  $('tab-workflow').textContent = 'Proposal context';
  const detailNote = document.createElement('p'); detailNote.className = 'tiny';
  detailNote.textContent = 'Recorded rationale for the version identified in the proposal. Exact parameter values are not supplied; catalog defaults are not approval parameters.';
  $('panel-workflow').prepend(detailNote);
  const returnBox = document.createElement('section'); returnBox.className = 'approval-return-note'; returnBox.hidden = true;
  returnBox.setAttribute('aria-label', 'Approval review context');
  const returnNote = document.createElement('p');
  const workflowScreen = $('screen-workflow'), workflowHeading = workflowScreen.querySelector('.page-heading');
  const returnLink = workflowHeading.querySelector('a[href="#workflows"]');
  const backNav = document.createElement('nav'); backNav.className = 'workflow-back-nav'; backNav.id = 'workflow-back-nav';
  backNav.setAttribute('aria-label', 'Return from workflow details'); backNav.append(returnLink); workflowHeading.before(backNav);
  returnBox.append(returnNote); workflowHeading.after(returnBox);
  const versionField = $('definition-version').parentElement; versionField.classList.add('workflow-version');
  versionField.querySelector('.label').textContent = 'Workflow version'; workflowHeading.querySelector('.workflow-meta').prepend(versionField);
  const unavailable = document.createElement('p'); unavailable.className = 'workflow-version-unavailable'; unavailable.id = 'workflow-version-unavailable';
  unavailable.setAttribute('role', 'status'); unavailable.hidden = true; returnBox.after(unavailable);
  const workflowLayout = workflowScreen.querySelector('.workflow-layout'), workflowAside = workflowLayout.querySelector('aside');
  const historyLink = $('definition-history'), historyHome = document.createComment('Original catalog history position'); historyLink.before(historyHome);
  const related = document.createElement('details'); related.className = 'workflow-related'; related.id = 'workflow-related'; related.hidden = true;
  related.innerHTML = '<summary>Related execution history</summary><p>Supporting evidence for this workflow ID; individual runs can reference other versions or targets.</p>';
  workflowLayout.after(related);
  let pendingReturn = null, pinnedRoute = null;
  const scope = () => JSON.stringify(window.KubernautUX.context());
  const route = () => { const [path, query = ''] = location.hash.slice(1).split('?'); const [screen, id] = path.split('/'); return { screen, id, query: new URLSearchParams(query) }; };
  function renderReview(id) {
    if (!cases[id] || window.KubernautFixtureContext.dataset() !== 'synthetic') return;
    $('review-subtitle').textContent = 'Submitted by ' + cases[id].actor;
    // Original routes replace textContent; recreate only this link, never the form or its draft.
    const ref = context.workflow(id), suppliedRef = context.reference(id);
    name.replaceChildren(document.createTextNode(cases[id].workflow));
    risk.hidden = !cases[id].repeat;
    $('approval-workflow-version').textContent = context.validReference(suppliedRef) ? suppliedRef.version : 'Invalid recommendation: required workflow ID/version missing';
    if (ref && context.canReadCatalog()) {
      const link = document.createElement('a'); link.id = 'proposed-workflow-link';
      link.href = '#workflow/' + encodeURIComponent(ref.workflowId) + '?' + new URLSearchParams({ version: ref.version }); link.textContent = cases[id].workflow;
      link.setAttribute('aria-describedby', workflowNote.id); name.replaceChildren(link);
      workflowNote.textContent = 'Read-only details for the workflow ID and version proposed by this request.';
    } else if (ref) {
      workflowNote.textContent = 'Workflow details require a separate read permission. The versioned proposal remains available for approval review.';
    } else {
      workflowNote.textContent = context.validReference(suppliedRef) ? 'Details for this exact workflow ID/version are unavailable in this scope. No other workflow or version is substituted.' : 'The recommendation is incomplete: a workflow ID and version are required. No reference is guessed.';
    }
  }
  function renderWorkflow(current) {
    const { id, query } = current, version = query.get('version');
    const from = pendingReturn || history.state?.knApprovalReturn;
    pendingReturn = null;
    const sourceRef = from && context.reference(from.request);
    const approvalOrigin = Boolean(from && from.scope === scope() && from.workflowId === id && from.version === version && context.canReadCatalog() && context.validReference(sourceRef) && sourceRef.workflowId === id && sourceRef.version === version);
    if (approvalOrigin) {
      history.replaceState({ ...history.state, knApprovalReturn: from }, '');
      returnLink.id = 'back-to-approval'; returnLink.dataset.restoreReview = 'true';
      returnLink.textContent = '← Back to approval review'; returnLink.href = '#review/' + from.request;
      returnNote.textContent = 'Workflow details for ' + from.request + ' · read only. No workflow selection, investigation start or approval submission.';
      returnBox.hidden = false;
      workflowScreen.dataset.approvalDetour = 'true'; workflowAside.hidden = true;
      related.hidden = false; related.append(historyLink);
    }
    if (!query.has('version')) { pinnedRoute = null; return; }
    const exact = query.getAll('version').length === 1 && version && context.definition(id, version);
    if (!exact) {
      workflowLayout.hidden = true; related.hidden = true; historyLink.hidden = true; unavailable.hidden = false;
      unavailable.textContent = 'The requested workflow ID/version is unavailable. No current, newer or first-record definition is substituted.';
      $('workflow-title').textContent = 'Workflow version unavailable'; $('workflow-subtitle').textContent = id;
      $('definition-version').textContent = version || 'Required version missing';
      return;
    }
    // The exact reference is an authored fixture. Its richer definition is synthetic, not an API claim.
    if (pinnedRoute !== location.hash) $('definition-data').value = 'proposed';
    currentWorkflow = exact; renderWorkflowDefinition(); pinnedRoute = location.hash;
    $('definition-version').textContent = exact.version;
    $('definition-contract-note').textContent = $('definition-data').value === 'proposed' ? 'Synthetic definition matching the explicitly proposed workflow ID and version. This richer detail projection is not supplied by the current summary API.' : 'The approval reference supplies this workflow ID and version. Other definition fields are not returned by this summary read; no newer revision is substituted.';
  }
  function render() {
    returnBox.hidden = true; unavailable.hidden = true; workflowLayout.hidden = false; workflowAside.hidden = false;
    delete workflowScreen.dataset.approvalDetour; related.hidden = true; historyLink.hidden = false; historyHome.after(historyLink);
    returnLink.id = 'workflow-back'; delete returnLink.dataset.restoreReview;
    returnLink.textContent = '← Back to workflows'; returnLink.href = '#workflows';
    const current = route();
    if (activeScreen === 'review' && !screen.hidden) { pinnedRoute = null; renderReview(current.id); }
    else if (activeScreen === 'workflow' && !workflowScreen.hidden) renderWorkflow(current);
    else { pendingReturn = null; pinnedRoute = null; }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('#proposed-workflow-link');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const current = route(), ref = context.workflow(current.id);
    if (current.screen === 'review' && ref && context.canReadCatalog()) pendingReturn = { request: current.id, workflowId: ref.workflowId, version: ref.version, scope: scope() };
  }, true);
  window.addEventListener('hashchange', render);
  document.addEventListener('change', event => {
    if (['evidence-dataset', 'topology', 'access-preview', 'ux-case-volume', 'definition-data'].includes(event.target.id)) { pendingReturn = null; render(); }
  });
  window.KubernautApprovalReview = Object.freeze({ render, ready: true });
  render(); window.KubernautUX.schedule();
})();
