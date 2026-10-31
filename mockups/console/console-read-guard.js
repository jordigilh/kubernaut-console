/* Offline read supersession only. Not backend authorization or a wire contract. */
(() => {
 const pending=new Map(),versions=new Map();let renderer=null,serial=0,contextEpoch=0;
 const value=id=>document.getElementById(id)?.value??'';
 const scope=()=>JSON.stringify([value('evidence-dataset'),value('topology'),value('access-preview'),value('inventory-visibility'),value('ux-case-volume')]);
 const path=()=>location.hash||'#approvals';
 function invalidate(channel,reset=true){versions.set(channel,(versions.get(channel)||0)+1);const token=pending.get(channel);if(!token)return;pending.delete(channel);if(reset)token.cancel?.();}
 function invalidateAll(){contextEpoch++;for(const channel of [...pending.keys()])invalidate(channel);window.KubernautClearDecision?.();}
 function begin(channel,cancel,focus={}){invalidate(channel);const token={channel,cancel,serial:++serial,scope:scope(),path:path(),contextEpoch,version:versions.get(channel),focusTarget:focus.target,initiator:focus.initiator,focusRegion:focus.initiator?.parentElement,ownedFocus:Boolean(focus.initiator&&document.activeElement===focus.initiator),inputStamp:window.KubernautUX?.focusStamp()};pending.set(channel,token);return token;}
 const current=token=>token.scope===scope()&&token.path===path()&&token.contextEpoch===contextEpoch&&token.version===versions.get(token.channel);
 const valid=token=>pending.get(token.channel)===token&&current(token);
 function finish(token,apply,render=renderer){
  if(!valid(token))return false;const active=document.activeElement,ownedAtCompletion=active===document.body||active===token.initiator||token.focusRegion?.contains(active);pending.delete(token.channel);apply();render?.();
  if(token.ownedFocus&&ownedAtCompletion&&token.focusTarget)requestAnimationFrame(()=>{
   if(!current(token)||pending.has(token.channel)||!window.KubernautUX?.focusUnmoved(token.inputStamp))return;
   const selector=typeof token.focusTarget==='function'?token.focusTarget():token.focusTarget,target=document.querySelector(selector);
   if(target&&target.getClientRects().length){target.focus({preventScroll:true});window.KubernautUX?.revealFocus(target);}
  });return true;
 }
 document.addEventListener('change',event=>{
  const id=event.target.id;
  if(['topology','access-preview','evidence-dataset','inventory-visibility','ux-case-volume'].includes(id))invalidateAll();
  else if(id==='catalog-state')invalidate('catalog',false);
  else if(id==='inventory-read-state')invalidate('inventory',false);
  else if(id==='remaining-read-state')invalidate('view:'+(location.hash.slice(1).split('?')[0]||'approvals'),false);
  else if(id==='ux-case-read')for(const channel of [...pending.keys()])if(channel.startsWith('finder:'))invalidate(channel,false);
  else if(id==='evidence-preview')for(const channel of [...pending.keys()])if(channel.startsWith('related:'))invalidate(channel,false);
  if(id==='review-state'&&event.target.value!=='pending')window.KubernautClearDecision?.();
 },true);
 window.addEventListener('hashchange',invalidateAll);
 window.KubernautReadGuard={begin,valid,finish,invalidate,invalidateAll,setRenderer:fn=>{renderer=fn},renderCurrent:()=>renderer?.()};
})();
