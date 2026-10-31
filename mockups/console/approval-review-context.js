/* Explicit OFFLINE fixture relationships. Not a live RAR/catalog contract or a name match. */
(() => {
  'use strict';
  const attributes = Object.freeze({
    'rar-demo-01': Object.freeze({ targetNamespace: 'payments', sourceCluster: 'spoke-a' }),
    'rar-demo-02': Object.freeze({ targetNamespace: 'demo-operator', sourceCluster: 'spoke-a' }),
    'rar-demo-03': Object.freeze({ targetNamespace: 'orders', sourceCluster: 'spoke-b' }),
  });
  // Complete AUTHORED SYNTHETIC recommendations, not historical/backend evidence.
  // Version is mandatory. It is never inferred from whichever catalog revision happens to load.
  const relationships = Object.freeze({
    'rar-demo-01': Object.freeze({ workflowId: 'wf-approval-container-memory', version: '1.0.0' }),
    'rar-demo-02': Object.freeze({ workflowId: 'wf-demo-01', version: '1.0.7' }),
    'rar-demo-03': Object.freeze({ workflowId: 'wf-approval-database-remediation', version: '1.0.0' }),
  });
  const synthetic = () => window.KubernautFixtureContext.dataset() === 'synthetic';
  const reference = request => synthetic() && Object.hasOwn(relationships, request) ? relationships[request] : null;
  const validReference = ref => Boolean(ref && ['workflowId', 'version'].every(key => typeof ref[key] === 'string' && ref[key].trim()));
  const definition = (id, version) => workflowCatalog.find(row => row.id === id && row.version === version) || null;
  function workflow(request) {
    const ref = reference(request);
    return validReference(ref) && definition(ref.workflowId, ref.version) ? ref : null;
  }
  window.KubernautApprovalContext = Object.freeze({
    attributes: request => synthetic() && Object.hasOwn(attributes, request) ? attributes[request] : null,
    reference, workflow, definition, validReference,
    canReadCatalog: () => window.KubernautFixtureContext.access() === 'operations',
  });
})();
