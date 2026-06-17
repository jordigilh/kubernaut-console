import { Message } from "@patternfly/chatbot";

interface Props {
  text: string;
  timestamp: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function UserBubble({ text, timestamp }: Props) {
  return (
    <Message
      role="user"
      content={text}
      name="You"
      timestamp={formatTime(timestamp)}
    />
  );
}
