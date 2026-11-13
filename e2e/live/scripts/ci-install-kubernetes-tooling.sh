#!/usr/bin/env bash
# Install the pinned Kind, kubectl, and Helm binaries used by a live lane.
set -euo pipefail

: "${MODE:?MODE is required}"

bin_dir="${RUNNER_TEMP}/live-e2e-bin"
helm_archive="${RUNNER_TEMP}/helm.tgz"
mkdir -p "${bin_dir}"

kind_version="v0.32.0"
curl --fail --silent --show-error --location \
  --output "${bin_dir}/kind" \
  "https://github.com/kubernetes-sigs/kind/releases/download/${kind_version}/kind-linux-amd64"
echo "50030de23cf40a18505f20426f6a8506bedf13c6e509244bd1fa9463721b0f54  ${bin_dir}/kind" | sha256sum --check
chmod 0755 "${bin_dir}/kind"

kubectl_version="v1.36.1"
curl --fail --silent --show-error --location \
  --output "${bin_dir}/kubectl" \
  "https://dl.k8s.io/release/${kubectl_version}/bin/linux/amd64/kubectl"
echo "629d3f410e09bf49b64ae7079f7f0bda1191efed311f7d37fdbab0ad5b0ec2b7  ${bin_dir}/kubectl" | sha256sum --check
chmod 0755 "${bin_dir}/kubectl"

helm_version="v3.18.6"
curl --fail --silent --show-error --location \
  --output "${helm_archive}" \
  "https://get.helm.sh/helm-${helm_version}-linux-amd64.tar.gz"
echo "3f43c0aa57243852dd542493a0f54f1396c0bc8ec7296bbb2c01e802010819ce  ${helm_archive}" | sha256sum --check
tar -xzf "${helm_archive}" -C "${RUNNER_TEMP}"
mv "${RUNNER_TEMP}/linux-amd64/helm" "${bin_dir}/helm"
chmod 0755 "${bin_dir}/helm"

echo "${bin_dir}" >> "${GITHUB_PATH}"
"${bin_dir}/kind" version
"${bin_dir}/kubectl" version --client
"${bin_dir}/helm" version

echo "127.0.0.1 keycloak kubernaut-console.local" | sudo tee -a /etc/hosts >/dev/null
