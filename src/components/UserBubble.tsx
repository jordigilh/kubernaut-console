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
      <div className="max-w-[75%]">
        <div className="bg-user-bubble rounded-2xl px-4 py-2.5">
          <p className="text-sm text-user-text">{text}</p>
        </div>
        <p className="text-[11px] text-gray-400 text-right mt-0.5 mr-2">
          {formatTime(timestamp)}
        </p>
      </div>
    </div>
  );
}
