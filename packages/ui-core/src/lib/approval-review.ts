// Fixture-only approval review model.
//
// This deliberately does not import the MCP client. The live RAR evidence and
// conditional-decision contracts (#2564/#2565) are still open, so this adapter
// is safe for component development and cannot submit an operational decision.

export type ApprovalDecision = "Approved" | "Rejected";

export type ApprovalLifecycleStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "decided-elsewhere";

export type ApprovalReadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T; observedAt: string }
  | { status: "empty"; observedAt: string }
  | { status: "partial"; data: T; missingFields: readonly string[]; observedAt: string }
  | { status: "stale"; data: T; observedAt: string; staleSince: string }
  | { status: "unavailable"; message: string; previous?: T }
  | { status: "forbidden"; message: string }
  | { status: "missing"; message: string };

export type ApprovalDataState<T> = Extract<
  ApprovalReadState<T>,
  { status: "ready" | "partial" | "stale" }
>;

export interface ApprovalActor {
  displayName: string;
  principal: string;
  role: "initiator" | "reviewer" | "service";
}

export interface ApprovalTarget {
  kind: string | null;
  name: string | null;
  namespace: string | null;
}

export interface ApprovalSource {
  clusterId: string | null;
  environment: string | null;
}

export interface ApprovalWorkflowReference {
  id: string;
  version: string;
  displayName: string;
  rationale: string | null;
  parameters: Readonly<Record<string, string>> | null;
}

export interface ApprovalEvidenceItem {
  id: string | null;
  occurredAt: string | null;
  category: string;
  summary: string;
  actor: ApprovalActor | null;
  redacted: boolean;
}

export interface ApprovalDecisionState {
  status: ApprovalLifecycleStatus;
  decision: ApprovalDecision | null;
  actor: ApprovalActor | null;
  reason: string | null;
  decidedAt: string | null;
}

export interface ApprovalListItem {
  id: string;
  parentRequestId: string | null;
  target: ApprovalTarget;
  source: ApprovalSource;
  submitter: ApprovalActor | null;
  createdAt: string | null;
  deadline: string | null;
  status: ApprovalLifecycleStatus;
}

export interface ApprovalReview {
  id: string;
  uid: string | null;
  parentRequestId: string | null;
  target: ApprovalTarget;
  source: ApprovalSource;
  submitter: ApprovalActor | null;
  reviewer: ApprovalActor | null;
  createdAt: string | null;
  deadline: string | null;
  approvalRationale: string | null;
  investigationSummary: string | null;
  workflow: ApprovalWorkflowReference | null;
  reviewedContentVersion: string;
  relatedEvidence: ApprovalReadState<readonly ApprovalEvidenceItem[]>;
  decision: ApprovalDecisionState;
}

export interface ApprovalDecisionInput {
  requestId: string;
  requestUid: string;
  decision: ApprovalDecision;
  reason: string;
  reviewedContentVersion: string;
  reviewer: ApprovalActor;
}

export interface ApprovalDecisionSnapshot {
  requestId: string;
  requestUid: string;
  target: ApprovalTarget;
  source: ApprovalSource;
  deadline: string | null;
  reviewer: ApprovalActor;
  reason: string;
  reviewedContentVersion: string;
}

export interface ApprovalDecisionReceipt {
  requestId: string;
  requestUid: string;
  decision: ApprovalDecision;
  actor: ApprovalActor;
  reason: string;
  decidedAt: string;
  source: "fixture";
}

export type ApprovalDecisionResult =
  | { status: "accepted"; receipt: ApprovalDecisionReceipt }
  | { status: "conflict"; message: string }
  | { status: "expired"; message: string }
  | { status: "stale"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "unknown"; message: string };

export interface ApprovalReviewAdapter {
  list(): Promise<ApprovalReadState<readonly ApprovalListItem[]>>;
  read(requestId: string): Promise<ApprovalReadState<ApprovalReview>>;
  retryEvidence(requestId: string): Promise<ApprovalReadState<readonly ApprovalEvidenceItem[]>>;
  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult>;
}

export interface ApprovalFixtureAdapterOptions {
  listState?: ApprovalReadState<readonly ApprovalListItem[]>;
  reviewStates?: Partial<Record<string, ApprovalReadState<ApprovalReview>>>;
  evidenceStates?: Partial<Record<string, ApprovalReadState<readonly ApprovalEvidenceItem[]>>>;
  decide?: (input: ApprovalDecisionInput) => Promise<ApprovalDecisionResult>;
}

export const FIXTURE_REVIEWER: ApprovalActor = {
  displayName: "Morgan Lee",
  principal: "operator-b",
  role: "reviewer",
};

const FIXTURE_INITIATOR_A: ApprovalActor = {
  displayName: "Sam Chen",
  principal: "operator-a",
  role: "initiator",
};

const FIXTURE_INITIATOR_ALEX: ApprovalActor = {
  displayName: "Alex Rivera",
  principal: "operator-a-alex",
  role: "initiator",
};

const FIXTURE_INITIATOR_JORDAN: ApprovalActor = {
  displayName: "Jordan Reed",
  principal: "operator-a-jordan",
  role: "initiator",
};

const OBSERVED_AT = "2026-10-31T14:00:00Z";

const FIXTURE_EVIDENCE: Record<string, readonly ApprovalEvidenceItem[]> = {
  "rar-demo-01": [
    {
      id: "evt-demo-01",
      occurredAt: "2026-10-31T13:54:00Z",
      category: "investigation",
      summary: "OOMKilled restarts and memory pressure were recorded for checkout-api.",
      actor: FIXTURE_INITIATOR_ALEX,
      redacted: false,
    },
  ],
  "rar-demo-02": [
    {
      id: "evt-demo-02",
      occurredAt: "2026-10-31T13:52:00Z",
      category: "investigation",
      summary: "OOMKilled restarts were reported.",
      actor: FIXTURE_INITIATOR_A,
      redacted: false,
    },
    {
      id: "evt-demo-03",
      occurredAt: "2026-10-31T13:53:00Z",
      category: "investigation",
      summary: "Memory growth continued during the observation window.",
      actor: null,
      redacted: true,
    },
  ],
  "rar-demo-03": [
    {
      id: null,
      occurredAt: "2026-10-31T13:56:00Z",
      category: "investigation",
      summary: "Recorded database remediation context is available, but the event identifier is not supplied.",
      actor: FIXTURE_INITIATOR_JORDAN,
      redacted: false,
    },
  ],
};

const FIXTURE_REVIEWS: Record<string, ApprovalReview> = {
  "rar-demo-01": {
    id: "rar-demo-01",
    uid: "rar-demo-01-uid",
    parentRequestId: "rr-demo-01",
    target: { kind: "Deployment", name: "checkout-api", namespace: "payments" },
    source: { clusterId: "spoke-a", environment: "Production" },
    submitter: FIXTURE_INITIATOR_ALEX,
    reviewer: null,
    createdAt: "2026-10-31T13:46:00Z",
    deadline: "2026-10-31T14:21:00Z",
    approvalRationale: "The production namespace requires human approval under the recorded policy decision.",
    investigationSummary: "The recorded investigation reports OOMKilled restarts and memory pressure in checkout-api.",
    workflow: {
      id: "wf-demo-01",
      version: "1.0.7",
      displayName: "increase-container-memory",
      rationale: "The recorded recommendation supplies an exact workflow reference.",
      parameters: null,
    },
    reviewedContentVersion: "rar-demo-01/review-v1",
    relatedEvidence: {
      status: "ready",
      data: FIXTURE_EVIDENCE["rar-demo-01"],
      observedAt: OBSERVED_AT,
    },
    decision: {
      status: "pending",
      decision: null,
      actor: null,
      reason: null,
      decidedAt: null,
    },
  },
  "rar-demo-02": {
    id: "rar-demo-02",
    uid: "rar-demo-02-uid",
    parentRequestId: "rr-demo-02",
    target: { kind: "Deployment", name: "demo-operator", namespace: "demo-operator" },
    source: { clusterId: "spoke-a", environment: "Production" },
    submitter: FIXTURE_INITIATOR_A,
    reviewer: null,
    createdAt: "2026-10-31T13:58:00Z",
    deadline: "2026-10-31T14:13:00Z",
    approvalRationale: "A reviewed Git change respects the target's Argo CD desired-state path. A direct live patch could be reconciled away.",
    investigationSummary: "The operator continues to OOM after an earlier memory increase. The investigation reassesses the mechanism using current observations and prior outcomes.",
    workflow: {
      id: "wf-demo-01",
      version: "1.0.7",
      displayName: "increase-memory-limits-gitops-v1",
      rationale: "A reviewed Git change respects the target's Argo CD desired-state path.",
      parameters: null,
    },
    reviewedContentVersion: "rar-demo-02/review-v1",
    relatedEvidence: {
      status: "unavailable",
      message: "Related evidence is unavailable. The loaded RAR context remains reviewable.",
    },
    decision: {
      status: "pending",
      decision: null,
      actor: null,
      reason: null,
      decidedAt: null,
    },
  },
  "rar-demo-03": {
    id: "rar-demo-03",
    uid: "rar-demo-03-uid",
    parentRequestId: "rr-demo-03",
    target: { kind: "StatefulSet", name: "orders-db", namespace: "orders" },
    source: { clusterId: "spoke-b", environment: "Production" },
    submitter: FIXTURE_INITIATOR_JORDAN,
    reviewer: null,
    createdAt: "2026-10-31T13:59:00Z",
    deadline: "2026-10-31T14:27:00Z",
    approvalRationale: "Recorded evidence describes a database workload incident.",
    investigationSummary: "Exact remediation and parameter detail is not supplied in this fixture read.",
    workflow: {
      id: "wf-demo-03",
      version: "1.0.0",
      displayName: "Recorded database remediation",
      rationale: null,
      parameters: null,
    },
    reviewedContentVersion: "rar-demo-03/review-v1",
    relatedEvidence: {
      status: "partial",
      data: FIXTURE_EVIDENCE["rar-demo-03"],
      missingFields: ["relatedEvidence[0].id"],
      observedAt: OBSERVED_AT,
    },
    decision: {
      status: "pending",
      decision: null,
      actor: null,
      reason: null,
      decidedAt: null,
    },
  },
};

const FIXTURE_LIST: readonly ApprovalListItem[] = Object.values(FIXTURE_REVIEWS).map((review) => ({
  id: review.id,
  parentRequestId: review.parentRequestId,
  target: review.target,
  source: review.source,
  submitter: review.submitter,
  createdAt: review.createdAt,
  deadline: review.deadline,
  status: review.decision.status,
}));

function isDataState<T>(state: ApprovalReadState<T>): state is ApprovalDataState<T> {
  return state.status === "ready" || state.status === "partial" || state.status === "stale";
}

function copyReview(review: ApprovalReview): ApprovalReview {
  return {
    ...review,
    target: { ...review.target },
    source: { ...review.source },
    workflow: review.workflow
      ? { ...review.workflow, parameters: review.workflow.parameters ? { ...review.workflow.parameters } : null }
      : null,
    decision: { ...review.decision },
  };
}

function makeDefaultReviewStates(): Map<string, ApprovalReadState<ApprovalReview>> {
  return new Map(
    Object.entries(FIXTURE_REVIEWS).map(([requestId, review]) => [
      requestId,
      { status: "ready", data: copyReview(review), observedAt: OBSERVED_AT } satisfies ApprovalReadState<ApprovalReview>,
    ]),
  );
}

function makeDefaultEvidenceStates(): Map<string, ApprovalReadState<readonly ApprovalEvidenceItem[]>> {
  return new Map([
    ["rar-demo-01", { status: "ready", data: FIXTURE_EVIDENCE["rar-demo-01"], observedAt: OBSERVED_AT }],
    ["rar-demo-02", { status: "unavailable", message: "Related evidence is unavailable. The loaded RAR context remains reviewable." }],
    ["rar-demo-03", { status: "partial", data: FIXTURE_EVIDENCE["rar-demo-03"], missingFields: ["relatedEvidence[0].id"], observedAt: OBSERVED_AT }],
  ]);
}

export function createApprovalFixtureAdapter(options: ApprovalFixtureAdapterOptions = {}): ApprovalReviewAdapter {
  const reviewStates = makeDefaultReviewStates();
  const evidenceStates = makeDefaultEvidenceStates();

  for (const [requestId, state] of Object.entries(options.reviewStates ?? {})) {
    if (state) reviewStates.set(requestId, state);
  }
  for (const [requestId, state] of Object.entries(options.evidenceStates ?? {})) {
    if (state) evidenceStates.set(requestId, state);
  }

  const configuredListState = options.listState;
  const configuredDecision = options.decide;

  return {
    async list() {
      if (configuredListState) return configuredListState;

      const items = FIXTURE_LIST.map((item) => {
        const reviewState = reviewStates.get(item.id);
        if (!reviewState || !isDataState(reviewState)) return item;
        return { ...item, status: reviewState.data.decision.status, reviewer: undefined };
      });
      return { status: "ready", data: items, observedAt: OBSERVED_AT };
    },

    async read(requestId) {
      return reviewStates.get(requestId) ?? {
        status: "missing",
        message: `Approval request ${requestId} was not found in the fixture scope.`,
      };
    },

    async retryEvidence(requestId) {
      const current = evidenceStates.get(requestId) ?? {
        status: "missing",
        message: `Related evidence for ${requestId} was not found in the fixture scope.`,
      } satisfies ApprovalReadState<readonly ApprovalEvidenceItem[]>;

      if (current.status !== "unavailable") return current;

      const recovered: ApprovalReadState<readonly ApprovalEvidenceItem[]> = {
        status: "ready",
        data: FIXTURE_EVIDENCE[requestId] ?? [],
        observedAt: OBSERVED_AT,
      };
      evidenceStates.set(requestId, recovered);

      const reviewState = reviewStates.get(requestId);
      if (reviewState && isDataState(reviewState)) {
        reviewStates.set(requestId, {
          ...reviewState,
          data: { ...reviewState.data, relatedEvidence: recovered },
        });
      }
      return recovered;
    },

    async decide(input) {
      if (configuredDecision) return configuredDecision(input);

      const current = reviewStates.get(input.requestId);
      if (!current || !isDataState(current)) {
        return { status: "unknown", message: "The fixture review could not be read before deciding." };
      }
      if (current.data.decision.status !== "pending") {
        return { status: "conflict", message: "This fixture request was already decided elsewhere." };
      }
      if (current.data.uid !== input.requestUid) {
        return { status: "stale", message: "The RAR identity is stale. Re-read before deciding." };
      }
      if (current.data.reviewedContentVersion !== input.reviewedContentVersion) {
        return { status: "stale", message: "The reviewed fixture content is stale. Re-read before deciding." };
      }
      if (!input.reason.trim()) {
        return { status: "unknown", message: "A decision reason is required." };
      }

      const decidedAt = new Date().toISOString();
      const receipt: ApprovalDecisionReceipt = {
        requestId: input.requestId,
        requestUid: input.requestUid,
        decision: input.decision,
        actor: input.reviewer,
        reason: input.reason,
        decidedAt,
        source: "fixture",
      };
      const nextReview: ApprovalReview = {
        ...current.data,
        reviewer: input.reviewer,
        decision: {
          status: input.decision === "Approved" ? "approved" : "rejected",
          decision: input.decision,
          actor: input.reviewer,
          reason: input.reason,
          decidedAt,
        },
      };
      reviewStates.set(input.requestId, { ...current, data: nextReview });
      return { status: "accepted", receipt };
    },
  };
}

export function formatUnknown(value: string | null | undefined): string {
  return value?.trim() ? value : "Unknown";
}

export function formatTarget(target: ApprovalTarget): string {
  const kind = formatUnknown(target.kind);
  const name = formatUnknown(target.name);
  return `${kind}/${name}`;
}

export function formatApprovalTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
