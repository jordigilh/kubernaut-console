interface Props {
  text: string;
}

export function AgentCTA({ text }: Props) {
  const lines = text.split("\n").filter(Boolean);

  return (
    <div
      data-testid="agent-cta"
      className="bg-kubernaut-teal-50 text-kubernaut-teal-600 rounded-lg px-4 py-3 text-xs font-medium leading-relaxed animate-fade-in"
    >
      {lines.map((line, idx) => (
        <p key={idx}>{line}</p>
      ))}
    </div>
  );
}
