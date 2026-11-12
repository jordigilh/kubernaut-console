import { readFileSync } from "node:fs";

export type NativeFullPipelineTarget = {
  kind: "Deployment";
  namespace: "kubernaut-system";
  name: "memory-eater";
};

type RuntimeManifest = {
  mode?: unknown;
  fullPipeline?: {
    targets?: {
      memoryEater?: {
        kind?: unknown;
        namespace?: unknown;
        name?: unknown;
      };
    };
  };
};

/**
 * Read the target selected by the upstream-preserving runtime manifest.
 * Native Console coverage must consume this resource and never create a
 * replacement fixture or mutate it during setup.
 */
export function nativeFullPipelineTarget(): NativeFullPipelineTarget {
  const manifestPath = process.env.LIVE_E2E_SETUP_MANIFEST;
  if (!manifestPath) {
    throw new Error("Native FullPipeline E2E requires LIVE_E2E_SETUP_MANIFEST");
  }

  let manifest: RuntimeManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeManifest;
  } catch {
    throw new Error("Native FullPipeline E2E runtime manifest is unreadable");
  }

  const target = manifest.fullPipeline?.targets?.memoryEater;
  if (
    manifest.mode !== "fullpipeline" ||
    target?.kind !== "Deployment" ||
    target.namespace !== "kubernaut-system" ||
    target.name !== "memory-eater"
  ) {
    throw new Error("Native FullPipeline E2E runtime manifest has an unexpected stable target");
  }

  return {
    kind: "Deployment",
    namespace: "kubernaut-system",
    name: "memory-eater",
  };
}
