import { useState, useEffect, useRef } from "react";
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
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    if (prevActiveRef.current && !isActive) {
      setCollapsed(true);
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
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  const toggle = () => setCollapsed((c) => !c);

  return (
    <div className="kn-thinking kn-fade-in">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="kn-thinking-header"
      >
        <svg
          style={{ height: 12, width: 12, transition: "transform 0.15s", transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isActive ? (
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <span>{label || "Thinking"}</span>
            <span className="kn-typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kn-teal-600)" }} />
            <span className="kn-typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kn-teal-600)" }} />
            <span className="kn-typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--kn-teal-600)" }} />
          </span>
        ) : (
          <span>Thought for {entries.length} steps</span>
        )}
        {startTime && (
          <span data-testid="elapsed-time" style={{ marginLeft: "auto", color: "var(--kn-text-dim)", fontSize: "0.6875rem" }}>
            {elapsed}
          </span>
        )}
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          data-testid="thinking-body"
          className="kn-thinking-body kn-scrollbar-thin"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="kn-fade-in" style={{ padding: "0.125rem 0" }}>
              {entry.type === "tool_call" ? (
                <code style={{ fontFamily: "monospace", color: "var(--kn-text-dim)" }}>{entry.text}</code>
              ) : (
                <div className="kn-markdown" style={{ fontSize: "0.6875rem" }}>
                  <MarkdownContent text={entry.text} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
