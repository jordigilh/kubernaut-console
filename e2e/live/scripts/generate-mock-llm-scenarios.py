#!/usr/bin/env python3
"""Build the live-E2E mock-LLM overrides from the active workflow catalog.

The upstream mock-LLM has useful built-in scenarios, but the workflow IDs in
those scenarios are deterministic test values.  The live lane seeds the real
catalog first, then uses this file to replace every workflow selection with
the UUID returned by that catalog.  Keep the selector and transcript shapes
in sync with ``test/infrastructure/shared_e2e.go`` without making the
upstream repository responsible for Console's fixture lifecycle.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def quoted(value: object) -> str:
    """Return a JSON-compatible double-quoted YAML scalar."""

    return json.dumps(str(value), ensure_ascii=True)


def inline_list(values: list[str]) -> str:
    return "[" + ", ".join(quoted(value) for value in values) + "]"


def emit_mapping(lines: list[str], indent: str, values: dict[str, object]) -> None:
    for key, value in values.items():
        if isinstance(value, dict):
            lines.append(f"{indent}{key}:")
            emit_mapping(lines, indent + "  ", value)
        elif isinstance(value, list):
            lines.append(f"{indent}{key}: {inline_list([str(item) for item in value])}")
        else:
            lines.append(f"{indent}{key}: {quoted(value)}")


def emit_arguments(lines: list[str], indent: str, arguments: dict[str, object]) -> None:
    if not arguments:
        lines.append(f"{indent}arguments: {{}}")
        return
    lines.append(f"{indent}arguments:")
    emit_mapping(lines, indent + "  ", arguments)


def emit_call(lines: list[str], indent: str, call: dict[str, Any]) -> None:
    """Emit a selector's ``tool_call`` mapping."""

    lines.append(f"{indent}tool_call:")
    emit_call_mapping(lines, indent + "  ", call)


def emit_call_mapping(lines: list[str], indent: str, call: dict[str, Any]) -> None:
    lines.append(f"{indent}name: {quoted(call['name'])}")
    emit_arguments(lines, indent, call.get("arguments", {}))
    if call.get("fallback_arguments"):
        lines.append(f"{indent}fallback_arguments:")
        emit_mapping(lines, indent + "  ", call["fallback_arguments"])


def emit_next_call(lines: list[str], indent: str, call: dict[str, Any]) -> None:
    """Emit selector-level chained calls, recursively nested under the chain."""

    next_call = call.get("next")
    if next_call is None:
        return
    lines.append(f"{indent}next_tool_call:")
    emit_call_mapping(lines, indent + "  ", next_call)
    emit_next_call(lines, indent + "  ", next_call)


def selector(
    lines: list[str],
    name: str,
    keywords: list[str],
    call: dict[str, Any],
    *,
    signal_patterns: list[str] | None = None,
    caller: str | None = None,
    phase: str | None = None,
    workflow_id: str | None = None,
    action_type: str | None = None,
    match_last_only: bool = True,
    repeat_tool_call: bool = False,
    match_last_value: bool | None = None,
) -> None:
    lines.append(f"  - name: {quoted(name)}")
    if keywords:
        lines.append(f"    keywords: {inline_list(keywords)}")
    if signal_patterns:
        lines.append(f"    signal_patterns: {inline_list(signal_patterns)}")
    if caller:
        lines.append(f"    caller: {quoted(caller)}")
    if phase:
        lines.append(f"    phase: {quoted(phase)}")
    if workflow_id:
        lines.append(f"    workflow_id: {quoted(workflow_id)}")
    if action_type:
        lines.append(f"    action_type: {quoted(action_type)}")
    if match_last_value is not None:
        lines.append(f"    match_last_only: {'true' if match_last_value else 'false'}")
    else:
        lines.append(f"    match_last_only: {'true' if match_last_only else 'false'}")
    if repeat_tool_call:
        lines.append("    repeat_tool_call: true")
    emit_call(lines, "    ", call)
    emit_next_call(lines, "    ", call)


def target_call(namespace: str, kind: str, name: str, tool: str) -> dict[str, Any]:
    call: dict[str, Any] = {
        "name": tool,
        "arguments": {
            "namespace": namespace,
            "kind": kind,
            "name": name,
            "api_version": "apps/v1" if kind in {"Deployment", "StatefulSet"} else "v1",
        },
    }
    return call


def investigate_call(namespace: str, kind: str, name: str, *, interaction_mode: str | None = None, cluster_id: str | None = None) -> dict[str, Any]:
    call = target_call(namespace, kind, name, "kubernaut_investigate")
    if interaction_mode:
        call["arguments"]["interaction_mode"] = interaction_mode
    if cluster_id:
        call["arguments"]["cluster_id"] = cluster_id
    return call


def remediate_call(namespace: str, kind: str, name: str, *, cluster_id: str | None = None, description: str = "Console live E2E remediation") -> dict[str, Any]:
    call = target_call(namespace, kind, name, "kubernaut_remediate")
    call["arguments"]["description"] = description
    if cluster_id:
        call["arguments"]["cluster_id"] = cluster_id
    return call


def read_fixtures(path: Path, suffix: str) -> list[dict[str, str]]:
    fixtures: list[dict[str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        base, fixture_type = raw.split("|", 1)
        namespace = f"{base}-{suffix}" if suffix else base
        if fixture_type == "memory-eater":
            kind, name = "Deployment", "memory-eater"
        elif fixture_type == "crashloop":
            kind, name = "Deployment", "worker"
        elif fixture_type == "statefulset-pvc-failure":
            kind, name = "StatefulSet", "kv-store"
        else:
            continue
        fixtures.append({"base": base, "type": fixture_type, "namespace": namespace, "kind": kind, "name": name})
    if not fixtures:
        raise SystemExit("scenario generation failed: fixtures.list has no usable fixtures")
    return fixtures


def active_workflows(catalog: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in catalog.get("items", []):
        if item.get("status", {}).get("catalogStatus") != "Active":
            continue
        name = item.get("metadata", {}).get("name")
        workflow_id = item.get("status", {}).get("workflowId")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", name):
            continue
        if not isinstance(workflow_id, str) or not workflow_id.strip():
            continue
        environments = item.get("spec", {}).get("labels", {}).get("environment", [])
        if isinstance(environments, str):
            environments = [environments]
        if not isinstance(environments, list) or not environments:
            environments = ["default"]
        for environment in environments:
            if isinstance(environment, str) and environment:
                result[f"{name}:{environment}"] = workflow_id
    return result


def resolve(workflows: dict[str, str], *names: str) -> str:
    """Resolve an alias to an active UUID, preferring staging then production."""

    for name in names:
        for environment in ("staging", "production", "default"):
            value = workflows.get(f"{name}:{environment}")
            if value:
                return value
        candidates = sorted(value for key, value in workflows.items() if key.startswith(f"{name}:"))
        if candidates:
            return candidates[0]
    raise SystemExit(f"scenario generation failed: no active catalog entry for aliases {names!r}")


def emit_scenarios(lines: list[str], workflows: dict[str, str], ids: dict[str, str]) -> None:
    lines.append("scenarios:")
    for key in sorted(workflows):
        lines.append(f"  {quoted(key)}:")
        lines.append(f"    workflow_id: {quoted(workflows[key])}")
    for key in ("default", "af_unknown", "oomkilled"):
        lines.append(f"  {quoted(key)}:")
        lines.append(f"    workflow_id: {quoted(ids[key])}")
    lines.extend(
        [
            f"  {quoted('ka_gitops_workflow_discovery_2390')}:",
            "    confidence: 0.95",
            f"  {quoted('af_select_gitops_workflow_2390')}:",
            "    tool_call:",
            '      name: "kubernaut_select_workflow"',
            '      arguments:',
            '        rr_id: "$from_tool:kubernaut_investigate:rr_id"',
            f"        workflow_id: {quoted(ids['gitops'])}",
            '        parameters:',
            '          MEMORY_LIMIT_NEW: "512Mi"',
        ]
    )


def emit_fixture_selectors(lines: list[str], fixtures: list[dict[str, str]], ids: dict[str, str]) -> list[dict[str, str]]:
    memory = next((fixture for fixture in fixtures if fixture["type"] == "memory-eater"), None)
    if memory is None:
        memory = {"namespace": "kubernaut-system", "kind": "Deployment", "name": "memory-eater", "base": "default"}

    # These exact chains are intentionally registered before the broad
    # "investigate" selector.  The mock-LLM breaks equal-confidence ties by
    # registration order, just as the upstream generator does.
    selector(
        lines,
        "af_remediate_investigate_combined_1853",
        ["create and investigate remediation"],
        {
            **remediate_call(memory["namespace"], memory["kind"], memory["name"], description="FP E2E combined remediate+investigate request (#1853)"),
            "next": investigate_call(memory["namespace"], memory["kind"], memory["name"]),
        },
    )
    selector(
        lines,
        "af_full_interactive_remediation_1853",
        ["investigate and fix remediation"],
        {
            **investigate_call(memory["namespace"], memory["kind"], memory["name"], interaction_mode="full_remediation_autonomous"),
            "next": {
                "name": "kubernaut_discover_workflows",
                "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id"},
                "next": {
                    "name": "kubernaut_select_workflow",
                    "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id", "workflow_id": ids["consent"]},
                    "next": {"name": "kubernaut_watch", "arguments": {"name": "$from_tool:kubernaut_investigate:rr_id"}},
                },
            },
        },
    )
    selector(
        lines,
        "af_consent_gate_phase2_1899",
        ["create and investigate then sneak workflow discovery"],
        {
            **investigate_call(memory["namespace"], memory["kind"], memory["name"], interaction_mode="interactive"),
            "next": {"name": "kubernaut_discover_workflows", "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id"}},
        },
    )
    selector(
        lines,
        "af_consent_gate_phase3_1899",
        ["create and investigate then sneak workflow selection"],
        {
            **investigate_call(memory["namespace"], memory["kind"], memory["name"], interaction_mode="full_remediation"),
            "next": {
                "name": "kubernaut_discover_workflows",
                "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id"},
                "next": {
                    "name": "kubernaut_select_workflow",
                    "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id", "workflow_id": ids["consent"]},
                },
            },
        },
    )
    selector(
        lines,
        "af_no_reinvocation_after_complete_1912",
        ["create and investigate then complete and go silent"],
        {
            **remediate_call(memory["namespace"], memory["kind"], memory["name"], description="FP E2E no-reinvocation-after-complete request (#1912)"),
            "next": {
                "name": "kubernaut_investigate",
                "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id", "interaction_mode": "full_remediation_autonomous"},
                "next": {"name": "kubernaut_complete", "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id"}},
            },
        },
    )
    selector(
        lines,
        "af_not_actionable_autonomous_1918",
        ["investigate and verify the harness actionability override"],
        {
            **remediate_call(memory["namespace"], memory["kind"], memory["name"], description="FP E2E harness-enforced actionability gate request (#1918)"),
            "next": {
                "name": "kubernaut_investigate",
                "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id", "interaction_mode": "full_remediation_autonomous"},
                "next": {"name": "kubernaut_discover_workflows", "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id"}},
            },
        },
    )

    for fixture in fixtures:
        namespace, kind, name = fixture["namespace"], fixture["kind"], fixture["name"]
        if fixture["type"] == "memory-eater":
            keywords = [f"The {name} {kind} in {namespace} is OOMKilled"]
        elif fixture["type"] == "crashloop":
            keywords = [f"The {name} {kind} in {namespace} is in CrashLoopBackOff after a bad release"]
        else:
            keywords = [f"The {name} {kind} in {namespace} has a replica stuck Pending"]
        selector(lines, f"console_fixture_{fixture['base']}_investigate", keywords, investigate_call(namespace, kind, name))
        selector(
            lines,
            f"console_fixture_{fixture['base']}_remediate",
            [f"Fix the {name} {kind} in {namespace}"],
            remediate_call(namespace, kind, name, description=f"Console live E2E {fixture['base']} remediation"),
        )

    # Preserve the upstream AF selector contract for messages that are not
    # tied to one of Console's per-run fixture namespaces.
    selector(
        lines,
        "kubernaut_remediate",
        ["create a remediation request", "create remediation"],
        remediate_call(memory["namespace"], memory["kind"], memory["name"], description="FP E2E test remediation request"),
    )
    selector(
        lines,
        "af_investigate",
        ["start investigation", "investigate", "begin investigation"],
        {
            "name": "kubernaut_investigate",
            "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id"},
            "fallback_arguments": {"namespace": memory["namespace"], "kind": memory["kind"], "name": memory["name"], "api_version": "apps/v1"},
        },
    )
    selector(
        lines,
        "af_discover_workflows",
        ["discover available workflows", "discover workflows"],
        {"name": "kubernaut_discover_workflows", "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id"}},
    )
    selector(
        lines,
        "af_select_workflow",
        ["select workflow"],
        {"name": "kubernaut_select_workflow", "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id", "workflow_id": ids["oomkill"]}},
    )
    selector(
        lines,
        "af_select_gitops_workflow_2390",
        ["select the discovered GitOps workflow"],
        {"name": "kubernaut_select_workflow", "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id", "workflow_id": ids["gitops"], "parameters": {"MEMORY_LIMIT_NEW": "512Mi"}}},
    )
    selector(
        lines,
        "af_select_discovered_workflow_1899",
        ["select the discovered workflow"],
        {"name": "kubernaut_select_workflow", "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id", "workflow_id": ids["consent"]}},
    )
    selector(
        lines,
        "af_discover_workflows_1899",
        ["confirm discovery of workflows"],
        {"name": "kubernaut_discover_workflows", "arguments": {"rr_id": "$from_tool:kubernaut_investigate:rr_id"}},
    )
    selector(
        lines,
        "af_watch_1899",
        ["watch this remediation now"],
        {"name": "kubernaut_watch", "arguments": {"name": "$from_tool:kubernaut_investigate:rr_id"}},
    )
    selector(
        lines,
        "af_watch",
        ["watch remediation", "watch pipeline", "watch progress"],
        {"name": "kubernaut_watch", "arguments": {"name": "$from_tool:kubernaut_remediate:rr_id"}},
    )

    # KA's workflow-discovery selectors are retained because the same mock
    # service handles both AF's browser conversation and KA's internal calls.
    selector(
        lines,
        "ka_gitops_workflow_discovery_2390",
        ["FullPipelineA2ASeverityGrounding_fp_int_"],
        {"name": "list_available_actions", "arguments": {}},
        signal_patterns=["FullPipelineA2ASeverityGrounding_fp_int_"],
        caller="ka",
        phase="workflow_discovery",
        workflow_id=ids["gitops"],
        action_type="IncreaseMemoryLimits",
    )
    selector(
        lines,
        "ka_consent_gate_workflow_discovery_1899",
        ["FullPipelineA2ASeverityGrounding"],
        {"name": "list_available_actions", "arguments": {}},
        caller="ka",
        phase="workflow_discovery",
        workflow_id=ids["consent"],
        action_type="RestartPod",
    )

    # Fleet's interactive bridge remains a valid upstream selector even though
    # the Console browser suite does not execute it. It is harmless in local
    # mode and keeps the shared mock contract complete for the fleet lane.
    selector(
        lines,
        "af_ka_interactive_fleet_bridge_remediate_1768",
        ["ka-interactive-fleet-bridge-start"],
        remediate_call("fleet-ka-interactive", "Deployment", "ka-interactive-fleet-target", cluster_id="remote-cluster", description="E2E-FLEET-018 interactive bridge fleet cluster-scoping (#1768 Track 2 Gap D)"),
    )
    selector(
        lines,
        "af_ka_interactive_fleet_bridge_message_1768",
        ["ka-interactive-fleet-e2e-test"],
        {"name": "kubernaut_message", "arguments": {"rr_id": "$from_tool:kubernaut_remediate:rr_id", "message": "ka-interactive-fleet-e2e-test: what is the current memory limit configured on the target deployment?"}},
    )
    return memory


def emit_gitops_transcript(lines: list[str], namespace: str, workflow_id: str) -> None:
    lines.extend(
        [
            "transcript_scenarios:",
            '  - name: "af_gitops_interactive_2390"',
            "    steps:",
            '      - user: "investigate GitOps remediation for deployment memory-eater"',
            "        tool_call:",
            '          name: "kubernaut_investigate"',
            "          arguments:",
            f"            namespace: {quoted(namespace)}",
            '            kind: "Deployment"',
            '            name: "memory-eater"',
            '            api_version: "apps/v1"',
            '            interaction_mode: "interactive"',
            '      - user: "discover available workflows"',
            "        tool_call:",
            '          name: "kubernaut_discover_workflows"',
            "          arguments:",
            '            rr_id: "$from_tool:kubernaut_investigate:rr_id"',
            '      - user: "select the discovered GitOps workflow"',
            "        tool_call:",
            '          name: "kubernaut_select_workflow"',
            "          arguments:",
            '            rr_id: "$from_tool:kubernaut_investigate:rr_id"',
            f"            workflow_id: {quoted(workflow_id)}",
            "            parameters:",
            '              MEMORY_LIMIT_NEW: "512Mi"',
            '      - user: "watch remediation progress"',
            "        tool_call:",
            '          name: "kubernaut_watch"',
            "          arguments:",
            '            name: "$from_tool:kubernaut_investigate:rr_id"',
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-json", required=True, type=Path)
    parser.add_argument("--fixtures-list", required=True, type=Path)
    parser.add_argument("--suffix", default="")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    workflows = active_workflows(json.loads(args.catalog_json.read_text(encoding="utf-8")))
    if not workflows:
        raise SystemExit("scenario generation failed: active workflow catalog is empty")

    ids = {
        "crashloop": resolve(workflows, "crashloop-rollback-v1"),
        "stateful": resolve(workflows, "fix-statefulset-pvc-v1"),
        "oomkill": resolve(workflows, "increase-memory-limits-v1", "oomkill-increase-memory-v1"),
        "gitops": resolve(workflows, "git-revert-v2", "gitops-drift-2390-v1"),
        "consent": resolve(workflows, "fix-statefulset-pvc-v1", "fullpipeline-consent-job-v1", "increase-memory-limits-v1"),
    }
    fixtures = read_fixtures(args.fixtures_list, args.suffix)
    lines: list[str] = []
    emit_scenarios(lines, workflows, {"default": ids["crashloop"], "af_unknown": ids["oomkill"], "oomkilled": ids["oomkill"], **ids})
    lines.append("scenario_selectors:")
    memory = emit_fixture_selectors(lines, fixtures, ids)
    emit_gitops_transcript(lines, memory["namespace"], ids["gitops"])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    args.output.chmod(0o600)
    print(f"Generated mock-LLM scenarios for {len(workflows)} active catalog entries and {len(fixtures)} fixtures")


if __name__ == "__main__":
    main()
