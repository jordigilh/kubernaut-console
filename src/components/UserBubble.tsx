interface Props {
  text: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function UserBubble({ text, timestamp }: Props) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[75%] sm:max-w-[65%]">
        <div className="bg-user-bubble rounded-2xl px-4 py-2.5">
          <p className="text-sm text-user-text break-words overflow-wrap-anywhere">{text}</p>
        </div>
        <time
          dateTime={new Date(timestamp).toISOString()}
          className="block text-[11px] text-text-dim text-right mt-0.5 mr-2"
        >
          {formatTime(timestamp)}
        </time>
      </div>
    </div>
  );
}
