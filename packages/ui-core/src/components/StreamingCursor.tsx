export function StreamingCursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "1em",
        backgroundColor: "var(--pf-t--global--color--brand--default)",
        animation: "pf-v6-cursor-blink 1s steps(2) infinite",
        marginLeft: 2,
        verticalAlign: "text-bottom",
      }}
    />
  );
}
