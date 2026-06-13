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
    <div className="animate-fade-in w-full rounded-lg border border-border overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-white text-text-muted text-[11px] font-medium hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kubernaut-teal-600 focus-visible:ring-inset"
      >
        <svg
          className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isActive ? (
          <span className="flex items-center gap-1">
            <span>{label || "Thinking"}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
          </span>
        ) : (
          <span>Thought for {entries.length} steps</span>
        )}
        {startTime && (
          <span data-testid="elapsed-time" className="ml-auto text-text-dim text-[11px]">
            {elapsed}
          </span>
        )}
      </button>

      {/* Body */}
      {!collapsed && (
        <div
          ref={scrollRef}
          data-testid="thinking-body"
          className="max-h-[200px] overflow-y-auto border-t border-border bg-surface-secondary px-4 py-2.5 text-[11px] leading-relaxed scrollbar-thin"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="py-0.5 animate-fade-in">
              {entry.type === "tool_call" ? (
                <span className="font-mono text-text-dim">{entry.text}</span>
              ) : (
                <div className="text-text-muted [&_p]:text-[11px] [&_p]:mb-1 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-[11px] [&_h3]:font-semibold [&_table]:text-[10px] [&_li]:text-[11px] [&_code]:text-[10px]">
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
