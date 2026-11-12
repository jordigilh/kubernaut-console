#!/usr/bin/env python3
"""Write the immutable artifact manifest consumed by every live lane."""

import hashlib
import json
import os
from pathlib import Path


root = Path("downloaded")
files = sorted(path for path in root.rglob("*") if path.is_file())
if not files:
    raise SystemExit("no build artifacts were downloaded")

required = {
    "console-image.tar",
    "operator-image.tar",
    "operator-charts.tar.gz",
    "demo-scenarios.tar.gz",
    "must-gather.tar",
    "mock-llm.tar",
    "init-ubi-minimal.tar",
    "oauth2-proxy.tar",
    "aianalysis.tar",
    "apifrontend.tar",
    "authwebhook.tar",
    "datastorage.tar",
    "effectivenessmonitor.tar",
    "fleetmetadatacache.tar",
    "gateway.tar",
    "kubernautagent.tar",
    "notification.tar",
    "remediationorchestrator.tar",
    "signalprocessing.tar",
    "workflowexecution.tar",
    "db-migrate.tar",
}
present = {path.name for path in files}
missing = sorted(required - present)
if missing:
    raise SystemExit("missing required artifacts: " + ", ".join(missing))

entries = []
for path in files:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    relative = path.relative_to(root).as_posix()
    artifact_name = path.relative_to(root).parts[0]
    entries.append(
        {
            "artifactName": artifact_name,
            "path": relative,
            "bytes": path.stat().st_size,
            "sha256": digest,
        }
    )

manifest = {
    "schemaVersion": 1,
    "kind": "kubernaut-console-live-e2e-artifacts",
    "workflow": os.environ["GITHUB_WORKFLOW"],
    "runId": os.environ["GITHUB_RUN_ID"],
    "runUrl": f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
    "artifactTag": os.environ["ARTIFACT_TAG"],
    "lifecycleContract": os.environ["LIFECYCLE_CONTRACT"],
    "sources": {
        "console": {"repository": os.environ["GITHUB_REPOSITORY"], "sha": os.environ["CONSOLE_SHA"]},
        "kubernaut": {"repository": "jordigilh/kubernaut", "sha": os.environ["KUBERNAUT_SHA"]},
        "operator": {"repository": "jordigilh/kubernaut-operator", "sha": os.environ["OPERATOR_SHA"]},
        "demoScenarios": {"repository": "jordigilh/kubernaut-demo-scenarios", "sha": os.environ["SCENARIOS_SHA"]},
    },
    "imageContract": {
        "applicationRepository": "localhost",
        "applicationTag": os.environ["ARTIFACT_TAG"],
        "consoleImage": f"localhost/kubernaut-console:{os.environ['ARTIFACT_TAG']}",
        "operatorImage": f"localhost/kubernaut-operator:{os.environ['ARTIFACT_TAG']}",
        "auxiliaryImages": {
            "init-ubi-minimal": os.environ["INIT_UBI_MINIMAL_IMAGE"],
            "oauth2-proxy": os.environ["OAUTH2_PROXY_IMAGE"],
        },
    },
    "requiredArchiveNames": sorted(required),
    "artifacts": entries,
    "consumptionContract": {
        "loadTool": "docker or podman load each image archive",
        "localFleetSetupEntrypoint": "e2e/live/scripts/ci-provision-demo-infra.sh",
        "nativeFullPipelineSetupEntrypoint": "e2e/live/scripts/ci-provision-native-fullpipeline.sh",
        "nativeFullPipelineSetup": "github.com/jordigilh/kubernaut/test/infrastructure.SetupFullPipelineInfrastructure",
        "setupImageRepository": "localhost",
        "setupImageTag": os.environ["ARTIFACT_TAG"],
        "consoleOverride": "KUBERNAUT_CONSOLE_IMAGE",
        "operatorOverride": "KUBERNAUT_OPERATOR_IMAGE",
        "operatorTarFallback": "KUBERNAUT_OPERATOR_IMAGE_TAR",
        "chartPaths": ["KUBERNAUT_OPERATOR_CHART_PATH", "KUBERNAUT_DEPENDENCY_CHART_PATH"],
    },
}

output = Path("provenance")
output.mkdir(parents=True, exist_ok=True)
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2))
