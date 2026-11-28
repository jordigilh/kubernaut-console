import {
  formatConfidenceLevel,
  formatConfidenceScore,
  type ApprovalConfidenceBreakdown,
} from "../lib/approval-review";

interface Props {
  breakdown: ApprovalConfidenceBreakdown;
  /**
   * True when a partial read state reported workflowConfidence in
   * missingFields. The required contract value is then unknown for this read;
   * it is surfaced as Unknown rather than fabricated.
   */
  workflowConfidenceMissing?: boolean;
}

/**
 * Displays RCA confidence and workflow-selection confidence as distinct,
 * separately labeled values (kubernaut #2586 / console #180, BR-KA-016
 * lineage). Missing RCA confidence is unknown, not 0%; an explicit 0 stays
 * 0%. Scores come from the backend; the browser computes nothing.
 */
export function ApprovalConfidencePanel({ breakdown, workflowConfidenceMissing = false }: Props) {
  const workflowScore = workflowConfidenceMissing ? null : breakdown.workflowConfidence;
  return (
    <section className="kn-approval-confidence" aria-labelledby="approval-confidence-heading" data-testid="kn-approval-confidence">
      <h3 id="approval-confidence-heading">Confidence</h3>
      <dl className="kn-approval-ledger kn-approval-confidence-ledger" aria-label="Recorded confidence values">
        <div data-testid="kn-approval-rca-confidence" data-known={breakdown.rcaConfidence !== null ? "true" : "false"}>
          <dt>RCA confidence</dt>
          <dd className={breakdown.rcaConfidence === null ? "kn-approval-confidence-unknown" : undefined}>
            {formatConfidenceScore(breakdown.rcaConfidence)}
          </dd>
        </div>
        <div data-testid="kn-approval-workflow-confidence" data-known={workflowScore !== null ? "true" : "false"}>
          <dt>Workflow-selection confidence</dt>
          <dd className={workflowScore === null ? "kn-approval-confidence-unknown" : undefined}>
            {formatConfidenceScore(workflowScore)}
          </dd>
        </div>
        <div data-testid="kn-approval-confidence-level">
          <dt>Confidence level</dt>
          <dd>{formatConfidenceLevel(breakdown.level)} · qualifies workflow selection</dd>
        </div>
      </dl>
      <p className="kn-approval-muted kn-approval-confidence-note">
        RCA confidence and workflow-selection confidence are recorded separately. A missing RCA confidence is unknown, not 0%.
        Interactive workflow selection does not bypass policy evaluation; the approval reason is decided by the user-managed policy.
      </p>
    </section>
  );
}
