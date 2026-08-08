interface Props {
  onSuggest: (text: string) => void;
}

// Only "recent incidents" is generic enough to apply regardless of what's
// actually running in the cluster -- a specific pod/service name (e.g. the
// former "payments pods"/"CrashLoopBackOff alert" examples) reads as if the
// console expects that exact workload to exist, which is misleading as a
// generic starting suggestion.
const suggestions = ["Show me recent incidents in the cluster"];

// #47: the AF agent supports multiple distinct interaction modes selected by
// phrasing, with materially different behavior -- none of this was
// previously surfaced to the user (see DD-AF-011 for the mode taxonomy).
// Investigate-only ("just investigate X") is deliberately not advertised here
// even though the backend still supports it: it leaves the RR without a
// resolution path (no fix proposal, no auto-remediation) and breaks the
// investigate -> remediate loop this welcome screen is meant to teach.
const modeHints: Array<{ phrase: string; description: string }> = [
  { phrase: "Investigate and propose remediation for X", description: "root-causes the issue, then suggests fixes to choose from" },
  { phrase: "Fix X", description: "investigates and remediates automatically, no further back-and-forth" },
];

export function WelcomeState({ onSuggest }: Props) {
  return (
    <div className="kn-welcome kn-fade-in">
      <div className="kn-welcome-icon">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2>Kubernaut Agent</h2>
      <p>
        I can investigate Kubernetes incidents, diagnose root causes, and execute remediation workflows.
      </p>
      <dl className="kn-welcome-modes" aria-label="How to phrase your request">
        {modeHints.map(({ phrase, description }) => (
          <div key={phrase} className="kn-welcome-mode">
            <dt>"{phrase}"</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
      <p className="kn-welcome-mode-caption">
        X is the target of the investigation: the event or alert name and the namespace.
      </p>
      <div className="kn-welcome-suggestions" role="group" aria-label="Suggested prompts">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSuggest(text)}
            className="kn-suggest-btn"
            aria-label={`Suggest: ${text}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
