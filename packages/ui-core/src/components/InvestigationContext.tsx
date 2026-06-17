import { useState } from "react";
import { Flex, FlexItem, Label, Toolbar, ToolbarContent, ToolbarItem, Tooltip } from "@patternfly/react-core";
import { CheckCircleIcon, ExclamationCircleIcon, InProgressIcon, SyncAltIcon } from "@patternfly/react-icons";

interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "timed_out" | "complete";
}

type PFLabelColor = "blue" | "green" | "orange" | "red" | "purple" | "teal" | "grey" | "yellow";

const PHASE_CONFIG: Record<string, { label: string; color: PFLabelColor; icon: React.ReactElement }> = {
  investigation: { label: "Investigating", color: "blue", icon: <InProgressIcon /> },
  decision: { label: "Decision pending", color: "yellow", icon: <InProgressIcon /> },
  remediation: { label: "Executing", color: "teal", icon: <SyncAltIcon /> },
  verifying: { label: "Verifying", color: "blue", icon: <SyncAltIcon /> },
  failed: { label: "Failed", color: "red", icon: <ExclamationCircleIcon /> },
  timed_out: { label: "Timed Out", color: "red", icon: <ExclamationCircleIcon /> },
  complete: { label: "Complete", color: "green", icon: <CheckCircleIcon /> },
};

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  return (
    <Tooltip content={copied ? "Copied!" : `Click to copy: ${value}`}>
      <FlexItem>
        <Label isCompact color="blue" onClick={handleClick} style={{ cursor: "pointer" }}>
          {label}: {value}
        </Label>
      </FlexItem>
    </Tooltip>
  );
}

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId, phase }: Props) {
  const phaseConfig = phase ? PHASE_CONFIG[phase] : { label: "Ready", color: "green" as PFLabelColor, icon: <CheckCircleIcon /> };

  let displayResource = resource;
  if (resource && namespace) {
    displayResource = resource.replace(` (${namespace})`, "").replace(`(${namespace})`, "");
  }

  return (
    <Toolbar
      data-testid="investigation-context"
      aria-label="Investigation context"
    >
      <ToolbarContent>
        <ToolbarItem>
          <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
            {rrId && <Field label="RR" value={rrId} />}
            {alertName && alertName !== "unknown" && <Field label="Alert" value={alertName} />}
            {namespace && <Field label="NS" value={namespace} />}
            {displayResource && <Field label="Resource" value={displayResource} />}
            {cluster && <Field label="Cluster" value={cluster} />}
          </Flex>
        </ToolbarItem>
        <ToolbarItem align={{ default: "alignEnd" }}>
          <Label color={phaseConfig.color} icon={phaseConfig.icon} isCompact data-testid="phase-indicator">
            {phaseConfig.label}
          </Label>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
}
