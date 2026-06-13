import { useState, useEffect, useRef } from "react";

interface Props {
  stabilizationWindow: number;
}

export function VerificationTimer({ stabilizationWindow }: Props) {
  const startRef = useRef(Date.now());
  const [remaining, setRemaining] = useState(stabilizationWindow);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      setRemaining(Math.max(0, stabilizationWindow - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [stabilizationWindow]);

  const progress = stabilizationWindow > 0
    ? ((stabilizationWindow - remaining) / stabilizationWindow) * 100
    : 100;

  function formatTime(seconds: number): string {
    if (seconds <= 0) return "completing...";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s remaining`;
    return `${s}s remaining`;
  }

  return (
    <div
      data-testid="verification-timer"
      className="rounded-xl border border-purple-200 bg-purple-50 p-3 animate-fade-in"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
        <span className="text-xs font-semibold text-purple-900">
          Verifying stability
        </span>
        <span className="ml-auto text-[11px] text-purple-600 font-medium">
          {formatTime(remaining)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-purple-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
