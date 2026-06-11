import type { WorkflowOption } from "../hooks/useChat";

interface Props {
  options: WorkflowOption[];
  onSelect?: (name: string) => void;
}

export function WorkflowCards({ options, onSelect }: Props) {
  return (
    <div className="flex gap-2 sm:gap-3 flex-wrap" role="group" aria-label="Remediation options">
      {options.map((opt, idx) => (
        <button
          type="button"
          key={opt.workflowId || idx}
          onClick={() => onSelect?.(opt.name)}
          aria-label={`Select workflow: ${opt.name}${opt.recommended ? " (recommended)" : ""}`}
          className={`animate-slide-up flex-1 min-w-[180px] sm:min-w-[200px] max-w-[260px] rounded-xl border-2 bg-white p-3 shadow-sm cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-kubernaut-teal-600/50 transition-shadow text-left ${
            opt.recommended
              ? "border-kubernaut-teal-600"
              : "border-gray-200"
          }`}
          style={{ animationDelay: `${idx * 150}ms`, animationFillMode: "backwards" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                opt.recommended
                  ? "bg-kubernaut-teal-600/15 text-kubernaut-teal-600"
                  : "bg-amber-100 text-amber-700"
              }`}
              aria-hidden="true"
            >
              {opt.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-sm text-gray-900">
              {opt.name}
            </span>
          </div>
          {opt.description && (
            <p className="text-xs text-gray-500 ml-8">{opt.description}</p>
          )}
          {opt.recommended && (
            <span className="inline-block ml-8 mt-1.5 px-2 py-0.5 rounded text-[9px] font-bold bg-kubernaut-teal-600/15 text-kubernaut-teal-600 uppercase">
              Recommended
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
