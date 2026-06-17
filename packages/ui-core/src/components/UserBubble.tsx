interface Props {
  text: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function UserBubble({ text, timestamp }: Props) {
  return (
    <div className="kn-user-row kn-fade-in">
      <div>
        <div className="kn-user-bubble">
          <p>{text}</p>
        </div>
        <time
          dateTime={new Date(timestamp).toISOString()}
          className="kn-user-time"
        >
          {formatTime(timestamp)}
        </time>
      </div>
    </div>
  );
}
