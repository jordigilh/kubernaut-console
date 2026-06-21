# ACM Downstream Adaptation Guide

This guide covers adapting the `@kubernaut/plugin-ocm` for Red Hat Advanced Cluster Management (ACM) deployment.

## Compatibility Matrix

| ACM Version | OCP Console | OCM Version | PF Version | Status |
|---|---|---|---|---|
| 2.11+ | 4.18+ | 0.14+ | PF6 | Supported |
| 2.12+ | 4.21+ | 0.15+ | PF6 | Tested (dev cluster) |

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                    OCP Hub Cluster                          │
│                                                            │
│  ┌─────────────┐    ┌────────────────┐   ┌─────────────┐ │
│  │ OCP Console │───▶│ ConsolePlugin  │──▶│ kubernaut   │ │
│  │ (browser)   │    │ Proxy          │   │ console     │ │
│  │             │    │ (UserToken)    │   │ plugin svc  │ │
│  └─────────────┘    └────────────────┘   └─────────────┘ │
│                            │                               │
│                            ▼                               │
│                     ┌─────────────┐                        │
│                     │   kagenti   │                        │
│                     │  (hub A2A)  │                        │
│                     └─────────────┘                        │
│                                                            │
│  ┌─────────────────────────────────┐                       │
│  │  Open Cluster Management        │                       │
│  │  ClusterManagementAddOn         │                       │
│  │  + AddOnTemplate                │                       │
│  └─────────────────────────────────┘                       │
└───────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ Managed Cluster │  │ Managed Cluster │
│                 │  │                 │
│ ┌─────────┐    │  │ ┌─────────┐    │
│ │ kagenti │    │  │ │ kagenti │    │
│ │ agent   │    │  │ │ agent   │    │
│ └─────────┘    │  │ └─────────┘    │
│ ┌─────────┐    │  │ ┌─────────┐    │
│ │ SPIRE   │    │  │ │ SPIRE   │    │
│ └─────────┘    │  │ └─────────┘    │
└─────────────────┘  └─────────────────┘
```

## Deployment

### Prerequisites

1. **Hub cluster**: OCP 4.18+ with ACM 2.11+ installed
2. **Spoke clusters**: SPIRE agent and `kagenti-operator` pre-installed as infrastructure
3. **Image registry access**: GHCR or internal registry for plugin and agent images

### Step 1: Deploy Console Plugin

```bash
# Using Helm
helm install kubernaut-console-plugin \
  packages/plugin-ocm/deploy/helm/kubernaut-console-plugin/ \
  -n kubernaut --create-namespace

# Or using kustomize (without addon)
oc apply -k packages/plugin-ocm/deploy/
```

### Step 2: Enable the Plugin

```bash
# Automatic (via Helm values.yaml enablePlugin: true)
# Or manual:
./packages/plugin-ocm/scripts/enable-plugin.sh
```

### Step 3: Deploy ManagedClusterAddon

```bash
# Apply the addon framework resources on the hub
oc apply -k packages/plugin-ocm/deploy/addon/

# Label clusters for auto-deployment
oc label managedcluster my-cluster kubernaut=enabled
```

## Console Proxy Configuration

The `ConsolePlugin` CR declares a proxy endpoint:

```yaml
spec:
  proxy:
    - alias: kagenti
      authorization: UserToken
      endpoint:
        type: Service
        service:
          name: kagenti
          namespace: kubernaut
          port: 8443
```

**Key behaviors**:
- `authorization: UserToken` — the console proxy forwards the logged-in user's OAuth token to kagenti
- TLS is handled by OpenShift service-ca (auto-generated serving cert)
- The proxy supports HTTP streaming (SSE) — Go's `httputil.ReverseProxy` flushes immediately

## RBAC Integration

### ClusterRole for Console Users

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubernaut-user
rules:
  - apiGroups: [""]
    resources: ["pods", "events", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["kagenti.dev"]
    resources: ["agentruntimes"]
    verbs: ["get", "list"]
```

### ClusterRole for Remediation Approval

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubernaut-admin
rules:
  - apiGroups: ["kagenti.dev"]
    resources: ["agentruntimes"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["update", "patch"]
```

## ManagedClusterAddon Lifecycle

### Deployment Flow

1. Admin labels a `ManagedCluster` with `kubernaut=enabled`
2. OCM `Placement` matches the cluster
3. `ClusterManagementAddOn` triggers `AddOnTemplate` rendering
4. OCM deploys the workload manifests to the spoke cluster:
   - Namespace (`kubernaut`)
   - ServiceAccount
   - Deployment (`kagenti`)
   - Service
   - AgentRuntime CR

### Health Monitoring

The addon reports health via the agent's readiness probe:

```yaml
readinessProbe:
  httpGet:
    path: /healthz
    port: health
  initialDelaySeconds: 5
  periodSeconds: 10
```

OCM propagates this to `ManagedClusterAddOn.status.conditions`:

```yaml
status:
  conditions:
    - type: Available
      status: "True"
      reason: AgentRunning
```

### Upgrading Agents

Update the image in `AddOnDeploymentConfig`:

```bash
oc patch addondeploymentconfig kubernaut-agent-config \
  -n open-cluster-management \
  --type merge \
  -p '{"spec":{"customizedVariables":[{"name":"agentImage","value":"ghcr.io/jordigilh/kagenti:v0.2.0"}]}}'
```

OCM will roll out the update to all managed clusters matching the placement.

## SPIRE Integration

The `kagenti` agent requires SPIRE for workload identity:

- **Trust domain**: `kubernaut.dev`
- **Socket path**: `/run/spire/sockets/agent.sock`
- **Assumption**: SPIRE agent is pre-installed as cluster infrastructure (not managed by this addon)

If SPIRE is not available, the agent falls back to Kubernetes ServiceAccount token authentication.

## Testing

### Verify Console Plugin

```bash
# Check plugin is registered
oc get consoleplugin kubernaut-console-plugin

# Check plugin is enabled
oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}'

# Access the console and navigate to Observe > Kubernaut
```

### Verify Addon Deployment

```bash
# Check addon status on hub
oc get managedclusteraddon kubernaut-agent -n <cluster-name>

# Check agent on spoke
oc get deploy kagenti -n kubernaut --context <spoke-context>
oc get agentruntime kubernaut-runtime -n kubernaut --context <spoke-context>
```

## Known Limitations

1. **SPIRE dependency**: Spoke clusters must have SPIRE pre-installed; the addon does not deploy SPIRE
2. **Single hub**: The current architecture assumes a single hub cluster running both the console plugin and OCM
3. **Token propagation**: The console proxy only forwards the user's token to the hub kagenti; spoke agents authenticate via SPIRE mTLS
4. **Bundle size**: The full webpack bundle is ~1.25MB ungzipped due to PF6 + Monaco editor dependencies; this is expected for a console plugin
