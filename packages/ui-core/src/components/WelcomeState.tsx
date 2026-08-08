interface Props {
  onSuggest: (text: string) => void;
}

// "active alerts" matches the app's own vocabulary (the console surfaces an
// "Alert" field, e.g. KubePodCrashLooping) and is generic enough to apply
// regardless of what's actually running in the cluster -- a specific
// pod/service name (e.g. the former "payments pods"/"CrashLoopBackOff alert"
// examples) reads as if the console expects that exact workload to exist,
// which is misleading as a generic starting suggestion.
const suggestions = ["List active alerts"];

// #47: the AF agent supports multiple distinct interaction modes selected by
// phrasing, with materially different behavior -- none of this was
// previously surfaced to the user (see DD-AF-011 for the mode taxonomy).
// Investigate-only ("just investigate X") is deliberately not advertised here
// even though the backend still supports it: it leaves the RR without a
// resolution path (no fix proposal, no auto-remediation) and breaks the
// investigate -> remediate loop this welcome screen is meant to teach.
//
// `pattern` is rendered in a monospace/code style distinct from the
// surrounding sentence -- these are literal templates to type (with X
// replaced), not clickable suggestions like `suggestions` above, and the
// visual distinction signals that (clicking a mode hint does nothing; only
// `suggestions` buttons are wired to onSuggest).
const modeHints: Array<{ pattern: string; description: string }> = [
  { pattern: "Investigate X", description: "to start an interactive remediation" },
  { pattern: "Fix X", description: "to trigger an autonomous remediation" },
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
      <ul className="kn-welcome-modes" aria-label="How to phrase your request">
        {modeHints.map(({ pattern, description }) => (
          <li key={pattern} className="kn-welcome-mode">
            Use <code className="kn-welcome-mode-pattern">"{pattern}"</code> {description}
          </li>
        ))}
      </ul>
      <p className="kn-welcome-mode-caption">
        Example: <code className="kn-welcome-mode-pattern">"Investigate the alert in the payments namespace"</code> or{" "}
        <code className="kn-welcome-mode-pattern">"Fix the alert in the payments namespace"</code>
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
