import { useState } from "react";

interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
}

function Field({ label, value }: { label: string; value: string }) {
  const [showPopover, setShowPopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    setShowPopover(true);
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => { setCopied(false); }
    );
    setTimeout(() => setShowPopover(false), 2000);
  };

  return (
    <div className="kn-context-field">
      <span className="kn-context-label">{label}</span>
      <button
        type="button"
        onClick={handleClick}
        className="kn-context-value"
        aria-label={`${label}: ${value} — click to copy`}
        title="Click to copy"
      >
        {value}
      </button>
      {showPopover && (
        <div
          role="tooltip"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            zIndex: 50,
            padding: "0.25rem 0.5rem",
            borderRadius: "0.25rem",
            background: "#fff",
            color: "var(--kn-text-primary)",
            fontSize: "0.6875rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            border: "1px solid var(--kn-border)",
            maxWidth: "17.5rem",
            wordBreak: "break-word",
          }}
        >
          {copied ? "Copied!" : value}
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <div className="kn-context-separator" aria-hidden="true" />;
}

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId }: Props) {
  let displayResource = resource;
  if (resource && namespace) {
    const escaped = namespace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    displayResource = resource
      .replace(` (${namespace})`, "")
      .replace(`(${namespace})`, "")
      .replace(new RegExp(`\\s+in\\s+${escaped}$`), "")
      .replace(new RegExp(`\\s+in\\s+${escaped}[\\s,.]`), " ");
  }

  return (
    <div
      data-testid="investigation-context"
      className="kn-context-bar"
      role="region"
      aria-label="Investigation context"
    >
      {rrId && (
        <>
          <Field label="Remediation ID" value={rrId} />
          <Separator />
        </>
      )}

      {alertName && alertName !== "unknown" && (
        <>
          <Field label="Alert" value={alertName} />
          <Separator />
        </>
      )}

      {namespace && (
        <>
          <Field label="Namespace" value={namespace} />
          <Separator />
        </>
      )}

      {displayResource && (
        <>
          <Field label="Resource" value={displayResource} />
        </>
      )}

      {cluster && (
        <>
          <Field label="Cluster" value={cluster} />
        </>
      )}
    </div>
  );
}
