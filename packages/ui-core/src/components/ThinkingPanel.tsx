import { useState, useEffect, useRef } from "react";
import { ExpandableSection, List, ListItem, Content, ContentVariants } from "@patternfly/react-core";
import type { ThinkingEntry } from "../hooks/useChat";
import { MarkdownContent } from "./MarkdownContent";

interface Props {
  entries: ThinkingEntry[];
  isActive: boolean;
  startTime?: number;
  label?: string;
}

function formatElapsed(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function ThinkingPanel({ entries, isActive, startTime, label }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [elapsed, setElapsed] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    if (prevActiveRef.current && !isActive) {
      setIsExpanded(false);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !startTime) return;
    const update = () => setElapsed(formatElapsed(startTime));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isActive, startTime]);

  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isExpanded]);

  const toggleText = isActive
    ? `${label || "Thinking"}...`
    : `Thought for ${entries.length} steps`;

  return (
    <ExpandableSection
      toggleText={toggleText}
      isExpanded={isExpanded}
      onToggle={(_e, expanded) => setIsExpanded(expanded)}
    >
      {startTime && (
        <Content component={ContentVariants.small} data-testid="elapsed-time">
          {elapsed}
        </Content>
      )}
      <div
        ref={scrollRef}
        data-testid="thinking-body"
        style={{ maxHeight: "200px", overflowY: "auto" }}
      >
        <List isPlain>
          {entries.map((entry) => (
            <ListItem key={entry.id}>
              {entry.type === "tool_call" ? (
                <code>{entry.text}</code>
              ) : (
                <MarkdownContent text={entry.text} />
              )}
            </ListItem>
          ))}
        </List>
      </div>
    </ExpandableSection>
  );
}
