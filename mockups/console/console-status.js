/* Presentation semantics only. No outcome, confidence or score is computed. */
(() => {
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shapes={
   success:'<circle class="silhouette" cx="10" cy="10" r="8"/><path class="mark" d="m6 10 3 3 5-6"/>',
   danger:'<path class="silhouette" d="M6 2h8l4 4v8l-4 4H6l-4-4V6Z"/><path class="mark" d="m7 7 6 6m0-6-6 6"/>',
   warning:'<path class="silhouette" d="m10 2 9 16H1Z"/><path class="mark" d="M10 7v5m0 3v.2"/>',
    info:'<path class="silhouette" d="M4 2h8l4 4v12H4Z"/><path class="mark" d="M12 2v5h4M7 10h6m-6 4h6"/>',
    finished:'<path class="silhouette" d="M4 18V2M4 3h12l-3 4 3 4H4"/><path class="mark" d="M7 3v4h3V3m0 4v4h3V7"/>',
   neutral:'<circle class="silhouette" cx="10" cy="10" r="8"/><path class="mark" d="M7.5 7.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.2"/>',
   scope:'<path class="silhouette" d="M2 3h9l7 7-8 8-8-8Z"/><circle class="mark" cx="6" cy="7" r="1"/>',
   restricted:'<rect class="silhouette" x="3" y="8" width="14" height="10" rx="2"/><path class="mark" d="M6 8V6a4 4 0 0 1 8 0v2m-4 4v2"/>'
 };
 function kind(value,fallback='neutral'){
  const v=String(value??'').toLowerCase();
   if(v==='completed')return 'neutral';
   if(v==='remediated')return 'success';
   if(['full','running','pending','stabilizing','assessing','waitingforpropagation','in_progress'].includes(v))return 'info';
  if(['failed','failure','denied','rejected','specdrift'].includes(v))return 'danger';
  if(['partial','expired','inconclusive','manualreviewrequired','awaitingapproval','pending review','awaiting human review','human review required','metricstimedout'].includes(v))return 'warning';
  if(['success','signal resolved','decision recorded'].includes(v))return 'success';
  if(['managed','excluded','unmanaged','managed scope'].includes(v))return 'scope';
  if(/^(not authorized|permission denied|forbidden)/.test(v))return 'restricted';
  if(/^(unknown|not captured|not supplied|not established|not yet|no_data|notcreated|noexecution|not started)/.test(v))return 'neutral';
  return ['success','danger','warning','info','scope','restricted'].includes(fallback)?fallback:'neutral';
 }
  function badge(value,tone='neutral',dimension=''){
   const v=String(value??'').toLowerCase(),treatment=v==='full'?'completeness':v==='completed'?'lifecycle':v==='remediated'?'positive-outcome':/^(unknown|not captured|not supplied|not established|not yet|no_data|notcreated|noexecution|not started)/.test(v)?'missing':'tint';
   const type=dimension==='Approval request'&&value==='Pending'?'warning':kind(value,tone),shape=v==='completed'?'finished':['completeness','lifecycle'].includes(treatment)?'info':type,svg=`<svg class="ux-status-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[shape]}</svg>`;
   const meaning=treatment==='completeness'?'Assessment completeness only; effectiveness is separate.':treatment==='lifecycle'?'Recorded lifecycle or historical label; this does not establish recovery.':treatment==='positive-outcome'?'Positive outcome label as supplied; capture provenance remains authoritative. No separate execution result, effectiveness score or independent recovery verification is inferred.':treatment==='missing'?'Evidence is not established; not zero, healthy or failed.':'';
   return `<span class="pill ux-status" data-status-kind="${type}" data-status-treatment="${treatment}"${dimension?` data-status-dimension="${escape(dimension)}"`:''}${meaning?` title="${escape(meaning)}"`:''}>${svg}<span>${escape(value)}</span></span>`;
 }
 function value(label,v){
  const text=String(v??''),l=label.toLowerCase();let tone=null;
  if(/^(unknown|not captured|not supplied|not established|not yet)/i.test(text))tone='neutral';
  else if(/phase|assessment (reason|completeness)|capture outcome|event outcome/.test(l))tone=kind(text);
  else if(l==='signal resolved')tone=text==='Yes'?'success':text==='No'?'warning':null;
  else if(l==='intervention applied'&&text==='Confirmed')tone='success';
  else if(/^(health|alert|metrics) component$/.test(l)&&[0,1,'0','1'].includes(v))tone=Number(v)===1?'success':l.startsWith('metrics')?'warning':'danger';
  return tone?badge(text,tone,label):escape(text);
 }
 function decorate(root){
  for(const node of root.querySelectorAll('.pill')){
   const text=node.textContent.trim();
   if(node.classList.contains('ux-status')&&node.querySelector('.ux-status-icon'))continue;
   if(!/^(Full|Partial|Completed|Running|Pending|Failed|Denied|Expired|Unknown|Managed|Excluded|Unmanaged|Awaiting human review|SpecDrift|NoExecution|no_data|in_progress)$/i.test(text))continue;
   const container=document.createElement('div');container.innerHTML=badge(text,'neutral',node.id==='review-status'?'Approval request':'');const fresh=container.firstElementChild;
    node.classList.remove('success','danger','warning','info','neutral');node.classList.add('ux-status');node.dataset.statusKind=fresh.dataset.statusKind;node.dataset.statusTreatment=fresh.dataset.statusTreatment;if(fresh.title)node.title=fresh.title;else node.removeAttribute('title');node.replaceChildren(...fresh.childNodes);
  }
 }
 window.KubernautStatus={badge,value,kind,decorate,escape};
})();
