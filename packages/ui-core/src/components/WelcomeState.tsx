interface Props {
  onSuggest: (text: string) => void;
  onFillTemplate: (text: string) => void;
}

// #47/#69: the AF agent supports multiple distinct interaction modes selected
// by phrasing, with materially different behavior -- none of this was
// previously surfaced to the user (see DD-AF-011 for the mode taxonomy).
// Investigate-only ("just investigate X") is deliberately not advertised here
// even though the backend still supports it: it leaves the RR without a
// resolution path (no fix proposal, no auto-remediation) and breaks the
// investigate -> remediate loop this welcome screen is meant to teach.
//
// All three are rendered uniformly (same list, same pattern/description
// styling) and are all clickable -- "List active alerts" is a complete
// command sent immediately, while "Investigate ..."/"Fix ..." are templates:
// clicking them fills the chat input with the verb (so the user only has to
// type the target) rather than sending an incomplete command.
const modeHints: Array<{ pattern: string; description: string; action: "send" | "fill"; text: string }> = [
  { pattern: "List active alerts", description: "see everything currently firing", action: "send", text: "List active alerts" },
  { pattern: "Investigate ...", description: "start an interactive remediation", action: "fill", text: "Investigate " },
  { pattern: "Fix ...", description: "trigger an autonomous remediation", action: "fill", text: "Fix " },
];

export function WelcomeState({ onSuggest, onFillTemplate }: Props) {
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
      <p>Here&rsquo;s how to get started:</p>
      <ul className="kn-welcome-modes" aria-label="How to phrase your request">
        {modeHints.map(({ pattern, description, action, text }) => (
          <li key={pattern} className="kn-welcome-mode">
            <button
              type="button"
              className="kn-welcome-mode-btn"
              onClick={() => (action === "send" ? onSuggest(text) : onFillTemplate(text))}
              aria-label={action === "send" ? `Suggest: ${text}` : `Start typing a "${pattern}" request`}
            >
              <code className="kn-welcome-mode-pattern">&quot;{pattern}&quot;</code> &mdash; {description}
            </button>
          </li>
        ))}
      </ul>
      {/* Not a 4th list item: it's not itself a phrasing option, just an
          illustration of how the "Investigate .../Fix ..." templates read
          once filled in -- keeping it out of the <ul> means screen readers
          announce the list as exactly 3 real choices. */}
      <p className="kn-welcome-mode-caption">
        e.g. <code className="kn-welcome-mode-pattern">&quot;Investigate the alert in the payments namespace&quot;</code>
      </p>
    </div>
  );
}
