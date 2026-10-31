/* Explicit offline fixture relationships, never inferred sessions or real permissions. */
(() => {
 const dataset=()=>document.getElementById('evidence-dataset')?.value||(new URLSearchParams(location.search).get('dataset')==='synthetic'?'synthetic':'recorded');
 const access=()=>document.getElementById('access-preview')?.value||'operations';
 const relationships=Object.freeze([Object.freeze({dataset:'synthetic',caseId:'rr-demo-02',workspaceId:'rr-demo-02',capability:'operations'})]);
 const available=relation=>relation.dataset===dataset()&&relation.capability===access();
 const workspaceForCase=id=>relationships.find(r=>r.caseId===id&&available(r));
 const workspaceForRoute=id=>relationships.find(r=>r.workspaceId===id&&available(r));
 window.KubernautFixtureContext=Object.freeze({dataset,access,workspaceForCase,workspaceForRoute});
})();
