import { useState, useEffect, useRef } from "react";
import type { ThinkingEntry } from "../hooks/useChat";

interface Props {
  entries: ThinkingEntry[];
  isActive: boolean;
}

export function ThinkingPanel({ entries, isActive }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(isActive);

  // Intentionally no deps: runs every render to detect active→inactive transition
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (wasActive && !isActive && entries.length > 0) {
      setCollapsed(true);
    }
  });

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  const toggle = () => setCollapsed((c) => !c);

  return (
    <div className="animate-fade-in">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
            Thinking
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
            <span className="w-1.5 h-1.5 rounded-full bg-kubernaut-teal-600 typing-dot" />
          </span>
        ) : (
          <span>Thought for {entries.length} steps</span>
        )}
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs leading-relaxed text-gray-500"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="py-0.5 animate-fade-in">
              {entry.type === "investigation" ? (
                <span className="text-gray-600">&#9656; {entry.text}</span>
              ) : entry.type === "reasoning" ? (
                <span className="italic text-gray-400">{entry.text}</span>
              ) : (
                <span>{entry.text}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
