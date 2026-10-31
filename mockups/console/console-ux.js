/* V6 offline UX refinements. No fetch, agent/session creation or mutations. */
(() => {
 const $=id=>document.getElementById(id),S=window.KubernautStatus,esc=S.escape;
 const finderStates=new Map(),positions=new Map();let committedKey=null,pendingLink=null,restoreHistory=false,frame=0,entry=0,focusedControl=null,inputSequence=0,scrollIntentSequence=0;
 history.scrollRestoration='manual';
 const synthetic=[{id:'rr-demo-02',name:'Recurring OOM in demo-operator',target:'Deployment/demo-operator',namespace:'demo-operator',cluster:'spoke-a',phase:'AwaitingApproval',outcome:'Pending review',capturedAt:'2026-10-28T13:58:00Z',workspace:'rr-demo-02'}];
 for(let i=1;i<100;i++)synthetic.push({id:'rr-study-'+String(i).padStart(4,'0'),name:['Checkout latency','Capacity alert','Deployment mismatch','Memory pressure'][i%4],target:['Deployment/checkout-api','StatefulSet/orders-db','Deployment/demo-operator','Service/metrics-service'][i%4],namespace:['payments','orders','demo-operator','observability'][i%4],cluster:Math.floor(i/4)%2?'spoke-b':'spoke-a',phase:['Completed','Failed','Analyzing','AwaitingApproval'][i%4],outcome:['Inconclusive','Failed','Not supplied','Pending review'][i%4],capturedAt:new Date(Date.UTC(2026,9,28,14)-i*3600000).toISOString(),workspace:null});
 function context(){return {dataset:$('evidence-dataset').value,mode:$('topology').value,access:$('access-preview').value,volume:$('ux-case-volume').value};}
 function route(){const [path,query='']=(location.hash.slice(1)||'approvals').split('?');return {screen:path.split('/')[0],id:path.split('/')[1],query:new URLSearchParams(query)};}
 function key(){const c=context();return [c.dataset,c.mode,c.access,c.volume,location.hash||'#approvals'].join('|');}
 function listKey(){const c=context();return [c.dataset,c.mode,c.access,c.volume,'investigations'].join('|');}
 function state(){const k=listKey();if(!finderStates.has(k))finderStates.set(k,{query:'',phase:'',cluster:'',from:'',page:1,read:'ready',reading:null,focusedResult:null,request:0});return finderStates.get(k);}
 function records(){
  if(context().dataset==='synthetic')return context().volume==='small'?synthetic.slice(0,1):synthetic;
  return window.KUBERNAUT_RECORDED_GOLDENS.records.map(r=>({id:r.rrId,name:r.scenario,target:r.remediationTarget?r.remediationTarget.kind+'/'+r.remediationTarget.name:'Not captured',namespace:r.remediationTarget?.namespace||'Not captured',cluster:'Not captured',phase:r.rrPhase,outcome:r.captureOutcome,capturedAt:r.capturedAt,workspace:null,golden:r}));
 }
 function record(id){return records().find(r=>r.id===id);}
 function permittedWorkspace(r){return Boolean(window.KubernautFixtureContext.workspaceForCase(r?.id));}
 function action(href,text,cls='',attrs=''){return `<a class="button ${cls}" href="${esc(href)}" ${attrs}>${esc(text)}</a>`;}
 function dualActions(r){const relation=window.KubernautFixtureContext.workspaceForCase(r.id);return action('#case/'+r.id,'Open case','',`data-ux-row="${esc(r.id)}"`)+(relation?action('#investigation/'+relation.workspaceId,'Open existing workspace','ux-workspace-action',`data-ux-row="${esc(r.id)}"`):'');}
 function remember(trigger){
  if(!committedKey||committedKey!==key())return;const old=positions.get(committedKey)||{},node=trigger?.nodeType===1?trigger:null,href=node?.getAttribute('href')||(typeof trigger==='string'?trigger:null);
  const screen=document.querySelector('.main > section[id^="screen-"]:not([hidden])'),matches=node&&screen?.contains(node)?[...screen.querySelectorAll('a[href]')].filter(a=>a.getAttribute('href')===href&&a.getClientRects().length):[];
  positions.set(committedKey,{...old,scroll:scrollY,...(href?{trigger:href,triggerIndex:Math.max(0,matches.indexOf(node)),triggerId:node?.id||null,triggerOwner:node?.closest('.sidebar,.app-header')?'navigation':'content'}:{})});
 }
 const controls=document.createElement('span');controls.className='preview-fields';controls.innerHTML='<label id="ux-volume-control">Case samples <select id="ux-case-volume"><option value="study">100 loaded / 1,000 simulated scope</option><option value="small">One synthetic case</option></select></label><label id="ux-case-read-control" hidden>Case read <select id="ux-case-read"><option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Successful empty</option><option value="partial">Partial</option><option value="stale">Stale</option><option value="unavailable">Unavailable</option><option value="forbidden">Permission denied</option></select></label><a id="ux-status-key" href="status-key.html?from=console" target="_blank" rel="noopener">Status key (new tab)</a>';
 document.querySelector('.preview-tools').append(controls);
 function renderFinder(){
  if(activeScreen!=='investigations'||context().access!=='operations')return;
  const st=state(),data=records();$('ux-case-read').value=st.read;
  const screen=$('screen-investigations');screen.innerHTML='<div class="page-heading"><div><h1 tabindex="-1">Recorded cases</h1><p>Find a case, or open an existing workspace where a separate authorized relationship is supplied.</p></div></div><div id="ux-case-finder"></div>';
  const host=$('ux-case-finder');host.dataset.finderKey=listKey();host.dataset.finderRead=st.read;
  if(!['ready','partial','stale'].includes(st.read)){
   const messages={loading:['Loading this read','No result or count is inferred.'],empty:['No cases returned for this scope','This preview represents a successful-empty read, not a failed read or global absence.'],unavailable:['Case read unavailable','The read failed. This is not a confirmed empty list.'],forbidden:['Case read not authorized','No protected case identities or counts are shown.']};const [title,text]=messages[st.read];
   host.innerHTML=`<div class="ux-read-panel" role="status"><h2>${esc(title)}</h2><p>${esc(text)}</p>${st.read==='unavailable'?'<button class="button" id="ux-retry-cases" type="button">Retry case read</button>':''}</div>`;
    if($('ux-retry-cases'))$('ux-retry-cases').addEventListener('click',()=>{
     const original=listKey(),ticket=window.KubernautReadGuard.begin('finder:'+listKey(),()=>{if(st.read==='loading')st.read='unavailable';st.request++}),snapshot=st.reading,stamp=inputSequence,request=++st.request,ownedFocus=document.activeElement===$('ux-retry-cases');
     st.read='loading';renderFinder();const progress=$('ux-case-finder').querySelector('h2');progress.tabIndex=-1;if(ownedFocus)progress.focus({preventScroll:true});
     setTimeout(()=>{if(st.request!==request)return;window.KubernautReadGuard.finish(ticket,()=>{st.read='ready'},()=>{if(activeScreen==='investigations'&&listKey()===original){const latestReading={scroll:scrollY,stamp:inputSequence,ownsFocus:[document.body,progress].includes(document.activeElement)};renderFinder();S.decorate(screen);requestAnimationFrame(()=>{
      if(activeScreen!=='investigations'||listKey()!==original||st.request!==request)return;
       const shouldRestore=inputSequence===stamp&&latestReading.ownsFocus;if(snapshot&&shouldRestore){scrollTo(0,snapshot.scroll);let target=snapshot.trigger?[...$('case-rows').querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===snapshot.trigger):null;if(!snapshot.trigger&&snapshot.rowId){target=[...$('case-rows').querySelectorAll('tr[data-case-id]')].find(row=>row.dataset.caseId===snapshot.rowId);if(target){target.tabIndex=-1;target.setAttribute('aria-label','Recovered recorded case '+snapshot.rowId);}}if(ownedFocus){(target||$('case-results-status')).focus({preventScroll:true});if(!target)$('case-results-status').scrollIntoView({block:'nearest',behavior:'instant'});}}
       else if(ownedFocus&&shouldRestore){$('case-results-status').focus({preventScroll:true});$('case-results-status').scrollIntoView({block:'start',behavior:'instant'});}
       else if(!shouldRestore&&inputSequence===latestReading.stamp)scrollTo(0,latestReading.scroll);
     });}});},500);
    });
   return;
  }
  const clusters=[...new Set(data.map(r=>r.cluster))].sort(),phases=[...new Set(data.map(r=>r.phase))].sort();
  host.innerHTML=`${['partial','stale'].includes(st.read)?`<p class="inventory-observation" role="status">${st.read==='partial'?'Partial read: only loaded examples are available; missing records and totals are unknown.':'Stale snapshot: recorded values are retained; current phase and freshness are not established.'}</p>`:''}<section class="card ux-case-finder-card"><div class="ux-case-filters"><label>Find in loaded examples<input type="search" id="case-search" value="${esc(st.query)}" placeholder="RR ID, target, namespace, scenario…"></label><label>Recorded phase<select id="case-phase"><option value="">All loaded phases</option>${phases.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label><label id="case-cluster-filter" ${context().mode!=='fleet'?'hidden':''}>Recorded source<select id="case-cluster"><option value="">All loaded sources</option>${clusters.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label><label>${context().dataset==='recorded'?'Captured':'Example created'} from (UTC)<input type="date" id="case-from" value="${esc(st.from)}"></label></div><p class="ux-case-note">${context().dataset==='recorded'?'Four historical golden captures. Source cluster ID is not exported; no workspace relationship is invented.':context().volume==='small'?'One loaded synthetic example. This small fixture is not a live count or backend paging claim.':'All queue rows are synthetic. 100 loaded examples represent a simulated 1,000-record scope, not a live total or backend paging claim.'} Search and filters cover the loaded examples only.</p><span id="case-results-status" class="ux-case-results-status" role="status" tabindex="-1"></span><div class="table-wrap" role="region" aria-label="Case results; responsive cards on narrow screens" tabindex="0"><table class="ux-case-table"><thead><tr><th>Case / target</th><th>Source / namespace</th><th>Phase / captured outcome</th><th>Capture / example time</th><th>Actions</th></tr></thead><tbody id="case-rows"></tbody></table></div><div class="ux-case-pager"><span>10 records per loaded page</span><div class="ux-case-actions"><button class="button" id="case-prev" type="button">Previous page</button><button class="button" id="case-next" type="button">Next page</button></div></div></section>`;
  const topPager=document.createElement('div');topPager.className='ux-case-pager ux-case-pager-top';topPager.setAttribute('role','group');topPager.setAttribute('aria-label','Paging at the start of case results');topPager.innerHTML='<span>10 records per loaded page</span><div class="ux-case-actions"><button class="button" id="case-prev-top" type="button">Previous page</button><button class="button" id="case-next-top" type="button">Next page</button></div>';$('case-results-status').after(topPager);
  $('case-phase').value=st.phase;$('case-cluster').value=st.cluster;
  for(const [id,property]of [['case-search','query'],['case-phase','phase'],['case-cluster','cluster'],['case-from','from']])$(id).addEventListener(id==='case-search'?'input':'change',e=>{st[property]=e.target.value;st.page=1;st.focusedResult=null;renderRows()});
  const enterPage=()=>{st.focusedResult=null;renderRows();$('case-results-status').focus({preventScroll:true});$('case-results-status').scrollIntoView({block:'start',behavior:'instant'});};
  for(const id of ['case-prev','case-prev-top'])$(id).addEventListener('click',()=>{st.page--;enterPage()});for(const id of ['case-next','case-next-top'])$(id).addEventListener('click',()=>{st.page++;enterPage()});renderRows();
 }
 function renderRows(){
  const st=state(),data=records(),query=st.query.trim().toLowerCase(),filtered=data.filter(r=>(!query||[r.id,r.name,r.target,r.namespace,r.cluster].join(' ').toLowerCase().includes(query))&&(!st.phase||r.phase===st.phase)&&(context().mode!=='fleet'||!st.cluster||r.cluster===st.cluster)&&(!st.from||r.capturedAt.slice(0,10)>=st.from)),pages=Math.max(1,Math.ceil(filtered.length/10));st.page=Math.max(1,Math.min(st.page,pages));
  const visible=filtered.slice((st.page-1)*10,st.page*10);
  $('case-rows').innerHTML=visible.length?visible.map(r=>`<tr data-case-id="${esc(r.id)}"><td data-label="Case / target"><strong>${esc(r.name)}</strong><small>${esc(r.id)}</small><small>${esc(r.target)}</small></td><td data-label="Source / namespace">${esc(r.cluster)}<small>${esc(r.namespace)}</small></td><td data-label="Phase / captured outcome">${S.badge(r.phase,'info','RR phase')}<small>${S.badge(r.outcome,'neutral','Captured outcome')}</small></td><td data-label="${context().dataset==='recorded'?'Captured':'Example time'}">${esc(r.capturedAt.replace('T',' ').replace('Z',' UTC'))}</td><td data-label="Actions"><div class="ux-case-actions">${dualActions(r)}</div></td></tr>`).join(''):'<tr><td class="ux-case-empty" colspan="5">No matches in the loaded examples. This filter result is not a failed read or global absence.</td></tr>';
  $('case-results-status').textContent=`Page ${st.page} of ${pages} · ${filtered.length} matches among ${data.length} loaded ${context().dataset==='recorded'?'historical captures':'synthetic examples'}`;
  for(const id of ['case-prev','case-prev-top'])$(id).disabled=st.page===1;for(const id of ['case-next','case-next-top'])$(id).disabled=st.page===pages;
 }
 function renderStudyCase(r){
  if(activeScreen!=='case'||r.golden||r.id==='rr-demo-02')return;
  if(!['ready','partial','stale'].includes($('remaining-read-state').value))return;
  $('case-status').hidden=true;$('case-content').hidden=false;$('case-heading').textContent=r.name;$('case-subtitle').textContent=r.id+' · synthetic queue-study record';
  $('case-content').innerHTML=`<section class="card"><h2>Supplied fixture identity</h2><div class="study-line"><span>Case</span><strong>${esc(r.id)}</strong></div><div class="study-line"><span>Target</span><strong>${esc(r.target)}</strong></div><div class="study-line"><span>Namespace / source</span><strong>${esc(r.namespace+' / '+r.cluster)}</strong></div><div class="study-line"><span>Recorded phase</span><strong>${S.badge(r.phase,'info','RR phase')}</strong></div><div class="study-line"><span>Captured outcome</span><strong>${S.badge(r.outcome,'neutral','Captured outcome')}</strong></div><p>Additional evidence, exact workflow, pending RAR and existing workspace are not supplied by this synthetic row. No other record is substituted and no investigation is started.</p></section>`;
 }
 function addOverviewActions(){
  if(activeScreen!=='overview'||context().dataset!=='synthetic'||context().access!=='operations')return;
  const a=$('overview-content').querySelector('a[href="#case/rr-demo-02"]');if(!a||a.parentElement.querySelector('.ux-workspace-action'))return;
   const relation=window.KubernautFixtureContext.workspaceForCase('rr-demo-02');if(!relation)return;const container=document.createElement('div');container.className='ux-case-actions';a.before(container);a.classList.add('button');container.append(a);container.insertAdjacentHTML('beforeend',action('#investigation/'+relation.workspaceId,'Open existing workspace','ux-workspace-action','data-ux-row="rr-demo-02"'));
 }
 function identity(){
  const clear=()=>document.querySelectorAll('.ux-identity,.ux-back-to-cases,.ux-local-context').forEach(n=>n.remove());
  if(context().access!=='operations'&&!['review'].includes(activeScreen)){clear();return;}
  let fields=null,r=null;
  if(activeScreen==='case'&&!$('case-content').hidden){r=record(route().id);if(r)fields=[['Case',r.id],['Target',r.target],['Namespace / source',r.namespace+' / '+r.cluster]];}
   if(activeScreen==='investigation'){const relation=window.KubernautFixtureContext.workspaceForRoute(route().id);if(relation){r=record(relation.caseId);if(r)fields=[['Case',r.id],['Target',r.target],['Target namespace',r.namespace],['Source cluster',r.cluster]];}}
   if(activeScreen==='review'&&cases[route().id]){const supplied=window.KubernautApprovalContext.attributes(route().id);fields=[['Request',route().id],['Target',$('review-target').textContent],['Target namespace',supplied?.targetNamespace||'Not supplied'],['Source cluster',supplied?.sourceCluster||'Not supplied'],['Approval deadline',$('review-deadline').textContent]];}
  if(!fields){clear();return;}
  const signature=JSON.stringify([activeScreen,context(),fields,permittedWorkspace(r)]),existing=$('ux-record-identity');
  if(existing?.closest('#screen-'+activeScreen)&&existing.dataset.uxIdentity===signature)return;
  clear();
  const screen=$('screen-'+activeScreen),heading=screen.querySelector('.page-heading'),bar=document.createElement('section');bar.className='ux-identity';bar.id='ux-record-identity';bar.setAttribute('aria-label','Current record identity');
   bar.dataset.uxIdentity=signature;bar.innerHTML=['review','investigation'].includes(activeScreen)?`<dl class="ux-identity-facts">${fields.map(([label,value])=>`<div><dt class="label">${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:`<div class="ux-identity-facts">${fields.map(([label,value])=>`<div><span class="label">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  if(activeScreen==='case'&&permittedWorkspace(r))bar.insertAdjacentHTML('beforeend','<div class="ux-record-actions">'+action('#investigation/'+window.KubernautFixtureContext.workspaceForCase(r.id).workspaceId,'Open existing workspace','ux-workspace-action')+'</div>');
  heading.after(bar);
   if(activeScreen==='case'&&context().access==='operations'){
   const back=document.createElement('a');back.href='#investigations';back.className='button ux-back-to-cases';back.dataset.restoreList='true';back.textContent='Back to cases';bar.after(back);
  }
  if(activeScreen==='case'&&permittedWorkspace(r))for(const a of $('case-content').querySelectorAll('a[href="#investigation/rr-demo-02"]')){a.textContent='Open existing workspace';a.classList.add('ux-workspace-action');}
 }
 function enhance(){
  const c=context();$('ux-volume-control').hidden=c.dataset!=='synthetic';$('ux-case-read-control').hidden=activeScreen!=='investigations'||c.access!=='operations';
  if(c.access==='operations'){
   if(activeScreen==='investigations'&&($('ux-case-finder')?.dataset.finderKey!==listKey()||$('ux-case-finder')?.dataset.finderRead!==state().read))renderFinder();
    if(activeScreen==='case'){
     const r=record(route().id);if(r)renderStudyCase(r);
     else if(['ready','partial','stale'].includes($('remaining-read-state').value)){$('case-heading').textContent='Recorded case';$('case-subtitle').textContent='';$('case-content').replaceChildren();$('case-content').hidden=true;$('case-status').hidden=false;$('case-status').innerHTML='<strong>Case unavailable in this sample scope</strong><p>The current sample does not supply this identifier. No previous case data is retained or another case substituted.</p>'+action('#investigations','Open current cases');}
    }
   addOverviewActions();
  }
  identity();S.decorate($('app'));
  const heading=document.querySelector('.main > section[id^="screen-"]:not([hidden]) h1');heading?.classList.add('ux-focus-target');
 }
 function commit(){
  frame=0;const nextKey=key(),changed=nextKey!==committedKey,knownEntry=history.state?.knUXKey===nextKey;
  $('app').style.setProperty('--ux-header-height',document.querySelector('.app-header').getBoundingClientRect().height+'px');
  if(changed){
    const saved=positions.get(nextKey),returnToList=pendingLink?.restore&&route().screen==='investigations',returnToReview=pendingLink?.restoreReview&&route().screen==='review',restore=Boolean(saved&&(restoreHistory&&knownEntry||returnToList||returnToReview));
    window.KubernautUX.lastNavigation={from:committedKey,to:nextKey,restore,savedScroll:saved?.scroll,savedTrigger:saved?.trigger,history:restoreHistory,knownEntry,returnToList,returnToReview};
   committedKey=nextKey;
   if(!knownEntry)history.replaceState({...history.state,knUXKey:nextKey,knUXEntry:++entry},'');
    if(restore){scrollTo(0,saved.scroll);const destination=document.querySelector('.main > section[id^="screen-"]:not([hidden])'),matches=saved.trigger?[...destination.querySelectorAll('a[href]')].filter(n=>n.getAttribute('href')===saved.trigger&&n.getClientRects().length):[],navigation=saved.triggerOwner==='navigation'&&saved.triggerId?$(saved.triggerId):null,target=navigation?.getClientRects().length?navigation:matches[saved.triggerIndex||0]||matches[0]||destination.querySelector('h1');target?.focus({preventScroll:true});revealFocus(target);}
    else if(pendingLink?.stamp===undefined||pendingLink.stamp===inputSequence){const heading=document.querySelector('.main > section[id^="screen-"]:not([hidden]) h1');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});}
   }else if(focusedControl?.id&&focusedControl.stamp===inputSequence){
   const n=$(focusedControl.id);if(n&&n.getClientRects().length){n.focus({preventScroll:true});if(typeof n.setSelectionRange==='function'&&focusedControl.selection)try{n.setSelectionRange(...focusedControl.selection)}catch{}}
  }
  $('app').dataset.uxReady=nextKey;pendingLink=null;restoreHistory=false;focusedControl=null;
 }
 function schedule(){enhance();if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(commit);}
 document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');if(!a||!a.closest('#app')||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    remember(a);pendingLink={href:a.getAttribute('href'),restore:a.dataset.restoreList==='true',restoreReview:a.dataset.restoreReview==='true',stamp:inputSequence};
  if(a.closest('.sidebar')){$('mobile-menu').setAttribute('aria-expanded','false');$('console-nav').setAttribute('aria-expanded','false');}
 },true);
 document.addEventListener('change',e=>{
   if(e.target.id&&e.target.closest('.preview-tools')&&e.target.id!=='ux-case-read'){focusedControl={id:e.target.id,stamp:inputSequence};}
 },true);
 window.addEventListener('scroll',()=>remember(),{passive:true});
 window.addEventListener('popstate',()=>{restoreHistory=Boolean(history.state?.knUXKey);});
  $('ux-case-volume').addEventListener('change',()=>{remember();schedule()});$('ux-case-read').addEventListener('change',e=>{
   const st=state();if(['ready','partial','stale'].includes(st.read)&&!['ready','partial','stale'].includes(e.target.value)){
    const links=[...document.querySelectorAll('#case-rows a[href]')],active=document.activeElement?.closest('#case-rows a[href]'),target=active||links.find(a=>a.getAttribute('href')===st.focusedResult),headerBottom=document.querySelector('.app-header').getBoundingClientRect().bottom,visibleRow=[...document.querySelectorAll('#case-rows tr[data-case-id]')].find(row=>{const box=row.getBoundingClientRect();return box.bottom>headerBottom&&box.top<innerHeight});
    st.reading={scroll:scrollY,trigger:target?.getAttribute('href')||null,rowId:target?.closest('tr')?.dataset.caseId||visibleRow?.dataset.caseId||null};
   }
   st.request++;st.read=e.target.value;renderFinder();S.decorate($('app'));
  });
  document.addEventListener('change',e=>{if(e.target.closest('.main')&&!e.target.closest('.ux-case-filters')&&!['decision-reason','composer'].includes(e.target.id))S.decorate($('app'));});
  document.addEventListener('input',e=>{if(e.target.id==='resource-search')S.decorate($('app'));});
  for(const type of ['pointerdown','keydown','input','wheel','touchmove'])document.addEventListener(type,event=>{inputSequence++;if(type==='wheel'||type==='touchmove'||type==='keydown'&&['PageUp','PageDown','Home','End'].includes(event.key)&&!event.target.matches('input,textarea,select,[contenteditable="true"]'))scrollIntentSequence++;},{capture:true,passive:type==='wheel'||type==='touchmove'});
  function revealFocus(target){
   if(!target||target.closest('dialog[open]'))return;const intent=scrollIntentSequence;
   requestAnimationFrame(()=>{
    if(!target.isConnected||document.activeElement!==target||scrollIntentSequence!==intent)return;
    const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const visible=rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth&&[rect.left+3,rect.left+rect.width/2,rect.right-3].every(x=>[rect.top+3,rect.top+rect.height/2,rect.bottom-3].every(y=>{const hit=document.elementFromPoint(x,y);return hit&&(hit===target||target.contains(hit))}));if(visible)return;
    let top=0,bottom=innerHeight;
    for(const overlay of document.querySelectorAll('.app-header,.mobile-menu-control,.sidebar,.ux-identity,.dock,.toast')){
     if(overlay.contains(target)||!overlay.getClientRects().length)continue;
     const style=getComputedStyle(overlay),box=overlay.getBoundingClientRect();if(!['sticky','fixed'].includes(style.position)||box.right<=rect.left||box.left>=rect.right)continue;
     if(style.position==='fixed'&&['dock','toast'].includes(overlay.id)){bottom=Math.min(bottom,box.top);continue;}
     const boundary=Number.parseFloat(style.top);if(Number.isFinite(boundary)&&box.top<=boundary+2&&box.bottom>0)top=Math.max(top,box.bottom);
    }
    if(rect.height>bottom-top-16)return;
    if(rect.top<top+8)scrollBy({top:rect.top-top-8,behavior:'instant'});else if(rect.bottom>bottom-8)scrollBy({top:rect.bottom-bottom+8,behavior:'instant'});
   });
  }
  document.addEventListener('focusin',event=>{if(activeScreen==='investigations'&&event.target.matches('#case-rows a[href]'))state().focusedResult=event.target.getAttribute('href');if(event.target.closest('#app')&&event.target.matches('a,button,input,select,textarea,[tabindex]'))revealFocus(event.target);});
 window.addEventListener('resize',schedule);
 window.KubernautUX={schedule,records,context,state,revealFocus,focusStamp:()=>inputSequence,focusUnmoved:stamp=>stamp===inputSequence};schedule();
})();
