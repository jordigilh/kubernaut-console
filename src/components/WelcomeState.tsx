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
    <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-kubernaut-teal-600/10 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-kubernaut-teal-600">
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">
        Kubernaut Agent
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        I can investigate Kubernetes incidents, diagnose root causes, and execute remediation workflows.
      </p>
      <div className="space-y-2 w-full max-w-sm" role="group" aria-label="Suggested prompts">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSuggest(text)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 text-left hover:border-kubernaut-teal-600 hover:bg-kubernaut-teal-50 transition-colors"
            aria-label={`Suggest: ${text}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
