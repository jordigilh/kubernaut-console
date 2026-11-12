// Command native-fullpipeline-setup invokes the pinned upstream FullPipeline
// infrastructure setup without running the upstream Ginkgo suite.
//
// This adapter intentionally calls SetupFullPipelineInfrastructure, the same
// authoritative orchestration used by upstream's fullpipeline suite. It then
// performs only the suite's setup-only fixture steps needed by Console:
// managed namespace labels, the upstream stable memory-eater target, and a
// sanitized mapping file. No credentials or bearer tokens are emitted.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jordigilh/kubernaut/test/infrastructure"
)

const nativeNamespace = "kubernaut-system"

type setupMetadata struct {
	SchemaVersion       int               `json:"schemaVersion"`
	ClusterName         string            `json:"clusterName"`
	Kubeconfig          string            `json:"kubeconfig"`
	WorkflowUUIDs       map[string]string `json:"workflowUUIDs"`
	RemediateNamespaces map[string]string `json:"remediateNamespaces"`
	Target              targetMetadata    `json:"target"`
}

type targetMetadata struct {
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

func required(name string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		panic(fmt.Sprintf("%s is required", name))
	}
	return value
}

func runKubectl(ctx context.Context, kubeconfig string, writer io.Writer, args ...string) error {
	commandArgs := append([]string{"--kubeconfig", kubeconfig}, args...)
	command := exec.CommandContext(ctx, "kubectl", commandArgs...)
	command.Stdout = writer
	command.Stderr = writer
	return command.Run()
}

func ensureManagedNamespace(ctx context.Context, kubeconfig, namespace string, staging bool, writer io.Writer) error {
	// Apply a dry-run manifest so reruns are idempotent, then add only the
	// suite-owned workload labels. The stable kubernaut-system namespace is
	// already created by upstream; the update is required for its target to be
	// eligible for Gateway signal handling.
	create := exec.CommandContext(ctx, "kubectl", "--kubeconfig", kubeconfig, "create", "namespace", namespace, "--dry-run=client", "-o", "yaml")
	apply := exec.CommandContext(ctx, "kubectl", "--kubeconfig", kubeconfig, "apply", "-f", "-")
	pipe, err := create.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create namespace pipe %s: %w", namespace, err)
	}
	create.Stderr = writer
	apply.Stdin = pipe
	apply.Stdout = writer
	apply.Stderr = writer
	if err := create.Start(); err != nil {
		return fmt.Errorf("start namespace %s: %w", namespace, err)
	}
	if err := apply.Run(); err != nil {
		_ = create.Process.Kill()
		_ = create.Wait()
		return fmt.Errorf("apply namespace %s: %w", namespace, err)
	}
	if err := create.Wait(); err != nil {
		return fmt.Errorf("finish namespace %s: %w", namespace, err)
	}
	labels := []string{"kubernaut.ai/managed=true"}
	if staging {
		labels = append(labels, "kubernaut.ai/environment=staging")
	}
	if err := runKubectl(ctx, kubeconfig, writer, append([]string{"label", "namespace", namespace}, append(labels, "--overwrite")...)...); err != nil {
		return fmt.Errorf("label namespace %s: %w", namespace, err)
	}
	return nil
}

func writeMetadata(path string, metadata setupMetadata) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create metadata directory: %w", err)
	}
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("encode setup metadata: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write setup metadata: %w", err)
	}
	return nil
}

func main() {
	clusterName := required("HUB_CLUSTER_NAME")
	kubeconfig := required("HUB_KUBECONFIG")
	metadataPath := required("LIVE_E2E_NATIVE_SETUP_METADATA")

	ctx := context.Background()
	writer := os.Stdout
	_, workflowUUIDs, remediateNamespaces, err := infrastructure.SetupFullPipelineInfrastructure(
		ctx,
		clusterName,
		kubeconfig,
		nil,
		writer,
	)
	if err != nil {
		panic(fmt.Errorf("upstream FullPipeline infrastructure setup failed: %w", err))
	}

	if err := ensureManagedNamespace(ctx, kubeconfig, nativeNamespace, false, writer); err != nil {
		panic(err)
	}
	namespaceKeys := make([]string, 0, len(remediateNamespaces))
	for key := range remediateNamespaces {
		namespaceKeys = append(namespaceKeys, key)
	}
	sort.Strings(namespaceKeys)
	for _, key := range namespaceKeys {
		if err := ensureManagedNamespace(ctx, kubeconfig, remediateNamespaces[key], true, writer); err != nil {
			panic(fmt.Errorf("prepare upstream remediate namespace %s: %w", key, err))
		}
	}

	if err := infrastructure.DeployMemoryEater(ctx, nativeNamespace, kubeconfig, writer); err != nil {
		panic(fmt.Errorf("deploy upstream stable memory-eater: %w", err))
	}

	if err := writeMetadata(metadataPath, setupMetadata{
		SchemaVersion:       1,
		ClusterName:         clusterName,
		Kubeconfig:          kubeconfig,
		WorkflowUUIDs:       workflowUUIDs,
		RemediateNamespaces: remediateNamespaces,
		Target: targetMetadata{
			Kind:      "Deployment",
			Namespace: nativeNamespace,
			Name:      "memory-eater",
		},
	}); err != nil {
		panic(err)
	}
	fmt.Fprintf(writer, "Native setup-only metadata written: %s\n", metadataPath)
}
