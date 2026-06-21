interface Props {
  onSuggest: (text: string) => void;
}

const suggestions = [
  "What's happening with the payments pods?",
  "Investigate the CrashLoopBackOff alert",
  "Show me recent incidents in the cluster",
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
