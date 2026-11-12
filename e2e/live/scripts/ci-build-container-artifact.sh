#!/usr/bin/env bash
# Build or capture one immutable container artifact and its provenance record.
set -euo pipefail

: "${BUILD_KIND:?BUILD_KIND is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

mkdir -p artifact

case "${BUILD_KIND}" in
  console)
    : "${SOURCE_SHA:?SOURCE_SHA is required}"
    image="localhost/kubernaut-console:${IMAGE_TAG}"
    archive="console-image.tar"
    metadata="console-image.json"
    docker build --pull=false --platform linux/amd64 \
      --tag "${image}" \
      --file packages/standalone/Containerfile \
      .
    ;;
  kubernaut)
    : "${SOURCE_SHA:?SOURCE_SHA is required}"
    : "${SERVICE:?SERVICE is required}"
    : "${DOCKERFILE:?DOCKERFILE is required}"
    image="localhost/${SERVICE}:${IMAGE_TAG}"
    archive="${SERVICE}.tar"
    metadata="${SERVICE}.json"
    docker build --pull=false --platform linux/amd64 \
      --build-arg GOFLAGS=-cover \
      --tag "${image}" \
      --file "kubernaut/${DOCKERFILE}" \
      kubernaut
    ;;
  support)
    : "${SOURCE_SHA:?SOURCE_SHA is required}"
    : "${SERVICE:?SERVICE is required}"
    : "${DOCKERFILE:?DOCKERFILE is required}"
    : "${BUILD_CONTEXT:?BUILD_CONTEXT is required}"
    image="localhost/${SERVICE}:${IMAGE_TAG}"
    archive="${SERVICE}.tar"
    metadata="${SERVICE}.json"
    build_args=(
      --pull=false
      --platform linux/amd64
      --tag "${image}"
      --file "kubernaut/${DOCKERFILE}"
    )
    if [[ "${SERVICE}" == "must-gather" ]]; then
      build_args+=(--build-arg TARGETARCH=amd64)
    fi
    docker build "${build_args[@]}" "kubernaut/${BUILD_CONTEXT}"
    ;;
  auxiliary)
    : "${IMAGE_NAME:?IMAGE_NAME is required}"
    : "${IMAGE_REFERENCE:?IMAGE_REFERENCE is required}"
    image="${IMAGE_REFERENCE}"
    archive="${IMAGE_NAME}.tar"
    metadata="${IMAGE_NAME}.json"
    docker pull --platform linux/amd64 "${IMAGE_REFERENCE}"
    ;;
  *)
    echo "error: unsupported BUILD_KIND=${BUILD_KIND}" >&2
    exit 2
    ;;
esac

docker save --output "artifact/${archive}" "${image}"
config_path="$(tar -xOf "artifact/${archive}" manifest.json | jq -er 'if length == 1 then .[0].Config else error("expected one image in archive") end')"
[[ "${config_path}" =~ ^blobs/sha256/[0-9a-f]{64}$ ]] || {
  echo "invalid image config path: ${config_path}" >&2
  exit 1
}
config_digest="$(tar -xOf "artifact/${archive}" "${config_path}" | sha256sum | awk '{print $1}')"
[[ "${config_digest}" == "${config_path#blobs/sha256/}" ]] || {
  echo "image config digest mismatch: ${config_path}" >&2
  exit 1
}
image_id="sha256:${config_digest}"
archive_sha="$(sha256sum "artifact/${archive}" | awk '{print $1}')"

if [[ "${BUILD_KIND}" == "auxiliary" ]]; then
  jq -n \
    --arg name "${IMAGE_NAME}" \
    --arg reference "${IMAGE_REFERENCE}" \
    --arg image_id "${image_id}" \
    --arg archive "${archive}" \
    --arg archive_sha "${archive_sha}" \
    '{kind:"auxiliary-image",name:$name,reference:$reference,imageID:$image_id,archive:$archive,archiveSHA256:$archive_sha}' \
    > "artifact/${metadata}"
else
  name="console"
  if [[ "${BUILD_KIND}" != "console" ]]; then
    name="${SERVICE}"
  fi
  jq -n \
    --arg source_sha "${SOURCE_SHA}" \
    --arg name "${name}" \
    --arg reference "${image}" \
    --arg image_id "${image_id}" \
    --arg archive "${archive}" \
    --arg archive_sha "${archive_sha}" \
    '{kind:"container-image",name:$name,sourceSHA:$source_sha,reference:$reference,imageID:$image_id,archive:$archive,archiveSHA256:$archive_sha}' \
    > "artifact/${metadata}"
fi
