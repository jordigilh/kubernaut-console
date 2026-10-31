/* Offline presentation only. Investigation information stays in one assistant message.
 * Approval review stays outside the conversation. No action, transport or countdown. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), screen = $('screen-investigation'), thread = $('thread');
  const card = thread.closest('.workspace-conversation-card'), message = thread.querySelector('.message:not(.user)');
  const escape = window.KubernautStatus.escape, badge = (text, tone = 'neutral') => window.KubernautStatus.badge(text, tone);
  const observations = [...message.querySelectorAll('.observations li')].map(node => node.textContent);
  const priorNarrative = [...message.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
  card.querySelector('h2').textContent = 'Conversation';
  card.querySelector('.tiny').textContent = 'Synthetic recorded example · investigation details expand in place · no live agent';
  message.classList.add('summary-message'); message.id = 'investigation-summary-message';
  const warning = document.createElement('div'); warning.id = 'summary-safety-warning'; warning.className = 'summary-safety-warning'; warning.hidden = true; thread.before(warning);
  const related = screen.querySelector('.workspace-layout>aside .card');
  related.querySelector('h2').textContent = 'Recorded case'; related.querySelectorAll('.fact-row').forEach(node => node.remove());
  const handoff = screen.querySelector('.workspace-layout>aside .card:last-child');
  handoff.querySelector('.label').textContent = 'Independent decision flow'; handoff.querySelector('h2').textContent = 'Approval review';
  handoff.querySelector('.tiny').textContent = 'Review and decide in Approvals. Reading the conversation or expanding details submits no decision.';
  const control = document.createElement('label'); control.id = 'summary-mock-control'; control.hidden = true;
  control.innerHTML = 'Information example <select id="summary-mock-state"><option value="complete">Complete findings</option><option value="metrics-pending">Metrics pending</option><option value="discovery-pending">Preparing workflow</option><option value="target-divergence">Different RCA target</option><option value="alignment-blocked">Alignment blocked</option></select>';
  document.querySelector('.preview-tools').append(control);
  const scope = () => JSON.stringify(window.KubernautUX.context()), nonce = crypto.randomUUID();
  const valid = () => activeScreen === 'investigation' && !screen.hidden && Boolean(window.KubernautFixtureContext.workspaceForRoute(location.hash.slice(1).split('/')[1]));
  let signature = null, renderedScope = null, pendingOrigin = null;
  function workflowMarkup(option, confidence) {
    const available = window.KubernautApprovalContext.definition(option.workflowId, option.version);
    const href = '#workflow/' + encodeURIComponent(option.workflowId) + '?' + new URLSearchParams({ version: option.version });
    return `<article class="summary-workflow" data-workflow-id="${escape(option.workflowId)}" data-recommended="${option.recommended}"><div class="summary-heading"><h4>${escape(option.name)}</h4>${badge(option.recommended ? 'Recommended' : 'Ruled out', option.recommended ? 'info' : 'neutral')}</div><div class="summary-workflow-meta"><span>Workflow version <strong>${escape(option.version)}</strong></span><span>ID <code>${escape(option.workflowId)}</code></span><span>Risk: ${escape(option.risk)}</span></div><p>${escape(option.description)}</p>${option.recommended ? `<p class="summary-note">Selection confidence: <strong id="workflow-context-confidence">${confidence}%</strong> · not effectiveness</p>` : `<p class="summary-ruled-out"><strong>Why ruled out:</strong> ${escape(option.ruledOutReason)}</p>`}<h4>Parameter values · read only</h4><dl class="summary-parameters">${Object.entries(option.parameters).map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>${available ? `<a id="summary-workflow-detail" href="${escape(href)}" data-summary-workflow="${escape(option.workflowId)}" data-summary-version="${escape(option.version)}">Open exact-version catalog detail →</a>` : '<p class="summary-note">Exact-version catalog detail is not loaded. No other definition is substituted.</p>'}</article>`;
  }
  function populate() {
    const currentScope = scope(), sameScope = renderedScope === currentScope;
    const expanded = sameScope && Boolean($('investigation-details')?.open), position = thread.scrollTop;
    const data = window.KubernautFindingsFixture.snapshot($('summary-mock-state').value), rca = data.rca;
    warning.hidden = !data.alignment && !data.divergence; delete warning.dataset.tone;
    if (data.alignment) { warning.dataset.tone = 'error'; warning.textContent = `Alignment check blocked remediation · ${data.alignment.flagged} of ${data.alignment.total} steps flagged. Expand investigation details for the verdict and findings.`; }
    else if (data.divergence) warning.textContent = `RCA target differs from the signal. Signal: ${data.divergence.signalTarget.kind}/${data.divergence.signalTarget.name} (${data.divergence.signalTarget.namespace}). Root cause: ${data.divergence.discoveryTarget.kind}/${data.divergence.discoveryTarget.name} (${data.divergence.discoveryTarget.namespace}).`;
    const synopsis = data.divergence ? rca.summary : 'Memory keeps growing after the earlier limit increase. The change was applied, but the signal remains unresolved; more headroom is only a temporary mitigation.';
    let recommendation = '', workflows = '';
    if (data.alignment) {
      recommendation = '<p class="summary-recommendation"><strong>Remediation blocked.</strong> The alignment check requires review.</p>';
      workflows = `<h3>Alignment verdict: ${escape(data.alignment.result)}</h3><p>${escape(data.alignment.summary)}</p><p>${data.alignment.flagged} of ${data.alignment.total} steps flagged.</p>${data.alignment.findings.map(item => `<article class="summary-workflow"><h4>Step ${item.step_index} · ${escape(item.step_kind)}</h4><p><code>${escape(item.tool)}</code></p><p>${escape(item.explanation)}</p></article>`).join('')}`;
    } else if (data.discoveryPending) {
      recommendation = '<p class="summary-recommendation" role="status"><strong>Preparing remediation workflow.</strong> Selection is still pending.</p>';
      workflows = '<h3>Preparing remediation workflow</h3><p>Identifying the action type, then selecting a matching workflow. Pending discovery is not an empty catalog.</p>';
    } else if (data.divergence) {
      recommendation = '<p class="summary-recommendation"><strong>No matching workflow for the RCA target.</strong> The signal-target workflow is not substituted.</p>';
      workflows = '<h3>No matching workflows for this RCA target</h3><p>The root cause is a different resource type. Do not substitute a workflow for the original signal target.</p>';
    } else {
      const recommended = data.options.find(option => option.recommended);
      recommendation = `<p class="summary-recommendation"><strong>Recommended:</strong> ${escape(recommended.name)} · <strong>v${escape(recommended.version)}</strong></p>`;
      workflows = '<h3>Workflow recommendation and alternative</h3>' + data.options.map(option => workflowMarkup(option, data.selectionConfidence)).join('');
    }
    const metric = value => rca.metricsPending ? 'Pending' : escape(String(value));
    const tokens = rca.metricsPending ? 'Awaiting final metrics' : rca.tokenMetricsAvailable ? `${rca.totalTokens.toLocaleString('en-US')} total · ${rca.promptTokens.toLocaleString('en-US')} input / ${rca.completionTokens.toLocaleString('en-US')} output` : 'Not available';
    message.innerHTML = `<div class="summary-heading"><span class="speaker">Investigation summary · synthetic example</span>${badge('High severity', 'warning')}</div><p id="summary-synopsis">${escape(synopsis)}</p>${recommendation}<details id="investigation-details" class="summary-details"${expanded ? ' open' : ''}><summary id="investigation-details-toggle">Investigation details <span>· RCA, workflows, prior outcome, metrics</span></summary><section class="summary-section" aria-labelledby="summary-rca-heading"><h3 id="summary-rca-heading">Root cause analysis</h3><p id="summary-full-rca">${escape(rca.summary)}</p><p class="summary-note">${data.divergence ? `RCA target: ${escape(rca.target)} · ${escape(rca.namespace)}` : 'RCA target matches the case target above.'}</p><h4>Recorded observations · illustrative</h4><ul class="summary-observations">${observations.map(value => `<li>${escape(value)}</li>`).join('')}</ul><h4>Causal chain</h4><ol class="summary-chain">${rca.causalChain.map(value => `<li>${escape(value)}</li>`).join('')}</ol><p class="summary-note">Structured RCA explanation, not raw provider reasoning.</p></section><section class="summary-section" id="summary-workflows">${workflows}</section><section class="summary-section" aria-labelledby="summary-prior-heading"><h3 id="summary-prior-heading">Prior outcome</h3><p>${escape(priorNarrative)}</p><p>Earlier intervention: <strong>applied</strong>. Signal: <strong>unresolved</strong>. Prior effectiveness: <strong id="prior-effectiveness">${escape(data.priorEffectiveness)}</strong>.</p><p class="summary-note">Execution completion was not recovery. Effectiveness is separate from RCA and selection confidence.</p></section><section class="summary-section" aria-labelledby="summary-metrics-heading"><h3 id="summary-metrics-heading">Investigation metrics</h3><dl class="summary-metrics"><div><dt>RCA confidence</dt><dd id="finding-confidence">${rca.metricsPending ? 'Pending' : rca.confidence + '%'}</dd></div><div><dt>Tool calls</dt><dd id="finding-tools">${metric(rca.toolCallsCount)}</dd></div><div><dt>LLM turns</dt><dd id="finding-turns">${metric(rca.llmTurns)}</dd></div><div class="summary-token-row"><dt>Token usage · not cost</dt><dd id="finding-tokens">${escape(tokens)}</dd></div></dl></section><div class="summary-actions" aria-label="Operational action placement only, unavailable in this recorded mock"><button class="button primary" type="button" disabled>Execute</button><button class="button" type="button" disabled>No action needed</button><button class="button" type="button" disabled>Escalate to team</button></div><p class="summary-note">Synthetic information only. No action or countdown is armed; parameters are read-only. Approval review stays separate.</p></details>`;
    renderedScope = currentScope;
    thread.scrollTop = sameScope ? position : thread.scrollHeight;
    screen.dataset.summaryScenario = data.mode;
  }
  function render() {
    control.hidden = !valid();
    if (valid()) {
      const next = scope() + '|' + $('summary-mock-state').value;
      if (signature !== next) { signature = next; populate(); }
    }
    const [path, query = ''] = location.hash.slice(1).split('?'), parts = path.split('/');
    if (activeScreen === 'workflow' && !$('screen-workflow').hidden) {
      const origin = pendingOrigin || history.state?.knSummaryOrigin; pendingOrigin = null;
      if (origin && origin.scope === scope() && origin.workflowId === parts[1] && origin.version === new URLSearchParams(query).get('version') && window.KubernautFixtureContext.workspaceForRoute('rr-demo-02')) {
        history.replaceState({ ...history.state, knSummaryOrigin: origin }, '');
        const link = $('workflow-back');
        if (link) { link.id = 'workflow-back-to-investigation'; link.href = origin.href; link.textContent = '← Back to investigation'; }
      }
    } else pendingOrigin = null;
  }
  document.addEventListener('change', event => {
    if (event.target.id === 'summary-mock-state') { signature = null; render(); }
    if (['evidence-dataset', 'access-preview', 'topology', 'ux-case-volume'].includes(event.target.id)) { pendingOrigin = null; render(); }
    if (event.target.id === 'definition-data') render();
  });
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (valid() && link?.dataset.summaryWorkflow) pendingOrigin = { href: location.hash, workflowId: link.dataset.summaryWorkflow, version: link.dataset.summaryVersion, scope: scope(), nonce };
    if (link?.id === 'workflow-back-to-investigation') {
      const origin = history.state?.knSummaryOrigin;
      if (origin && origin.scope === scope() && origin.nonce === nonce) { event.preventDefault(); history.back(); }
    }
  }, true);
  window.addEventListener('hashchange', render);
  window.KubernautSummaryMock = Object.freeze({ ready: true, render });
  render();
})();
