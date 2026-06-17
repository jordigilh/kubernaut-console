interface Props {
  text: string;
}

export function AgentCTA({ text }: Props) {
  const lines = text.split("\n").filter(Boolean);

  return (
    <div data-testid="agent-cta" className="kn-agent-cta kn-fade-in">
      {lines.map((line, idx) => (
        <p key={idx}>{line}</p>
      ))}
    </div>
  );
}
