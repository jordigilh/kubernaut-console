interface Props {
  onSuggest: (text: string) => void;
}

const suggestions = [
  "What's happening with the payments pods?",
  "Investigate the CrashLoopBackOff alert",
  "Show me recent incidents in the cluster",
];

// #47: the AF agent supports three distinct interaction modes selected by
// phrasing, with materially different behavior -- none of this was
// previously surfaced to the user (see DD-AF-011 for the mode taxonomy).
const modeHints: Array<{ phrase: string; description: string }> = [
  { phrase: "Investigate X", description: "root-causes the issue, then suggests fixes to choose from" },
  { phrase: "Just investigate X", description: "root-causes only \u2014 no fix suggestions unless you ask" },
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
