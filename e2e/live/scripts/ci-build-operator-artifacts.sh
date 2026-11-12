#!/usr/bin/env bash
# Build the pinned operator image and package the matching Helm charts.
set -euo pipefail

: "${SOURCE_SHA:?SOURCE_SHA is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

operator_version="$(awk -F'[:?= ]+' '/^VERSION[[:space:]]*\?=/{print $NF; exit}' kubernaut-operator/Makefile)"
test -n "${operator_version}"

helm lint kubernaut-operator/charts/kubernaut-operator --strict
helm lint kubernaut-operator/charts/kubernaut-development-dependencies --strict

image="localhost/kubernaut-operator:${IMAGE_TAG}"
docker build --pull=false --platform linux/amd64 \
  --build-arg VERSION="${operator_version}" \
  --build-arg GIT_COMMIT="${SOURCE_SHA}" \
  --tag "${image}" \
  kubernaut-operator

mkdir -p artifact/charts
docker save --output artifact/operator-image.tar "${image}"
tar -czf artifact/operator-charts.tar.gz \
  -C kubernaut-operator \
  charts/kubernaut-operator \
  charts/kubernaut-development-dependencies

config_path="$(tar -xOf artifact/operator-image.tar manifest.json | jq -er 'if length == 1 then .[0].Config else error("expected one image in archive") end')"
[[ "${config_path}" =~ ^blobs/sha256/[0-9a-f]{64}$ ]] || {
  echo "invalid image config path: ${config_path}" >&2
  exit 1
}
config_digest="$(tar -xOf artifact/operator-image.tar "${config_path}" | sha256sum | awk '{print $1}')"
[[ "${config_digest}" == "${config_path#blobs/sha256/}" ]] || {
  echo "image config digest mismatch: ${config_path}" >&2
  exit 1
}
image_id="sha256:${config_digest}"
image_sha="$(sha256sum artifact/operator-image.tar | awk '{print $1}')"
charts_sha="$(sha256sum artifact/operator-charts.tar.gz | awk '{print $1}')"
jq -n \
  --arg source_sha "${SOURCE_SHA}" \
  --arg version "${operator_version}" \
  --arg reference "${image}" \
  --arg image_id "${image_id}" \
  --arg image_archive_sha "${image_sha}" \
  --arg charts_archive_sha "${charts_sha}" \
  '{kind:"operator-qualification-input",repository:"jordigilh/kubernaut-operator",sourceSHA:$source_sha,version:$version,image:{reference:$reference,imageID:$image_id,archive:"operator-image.tar",archiveSHA256:$image_archive_sha},charts:{archive:"operator-charts.tar.gz",archiveSHA256:$charts_archive_sha,operatorPath:"charts/kubernaut-operator",dependencyPath:"charts/kubernaut-development-dependencies"}}' \
  > artifact/operator-provenance.json
