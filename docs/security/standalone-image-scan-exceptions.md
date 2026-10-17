# Standalone image scan exception record

**Record:** `SEC-EXC-2026-10-17-UBI-001`
**Status:** Accepted, pending upstream fixes
**Owner:** Kubernaut Console maintainers
**Opened:** 2026-10-17
**Review cadence:** Weekly CI/Dependabot runs and whenever either UBI base image changes

## Scope and policy

The CI pull-request scan builds the standalone image from
`packages/standalone/Containerfile` and runs Trivy against the local
`linux/amd64` artifact. It blocks fixable `HIGH` and `CRITICAL` findings. The
workflow's `ignore-unfixed: true` setting applies only to this local PR gate;
it does not suppress findings from the unchanged release digest scan.

This record covers unfixed findings inherited from the pinned UBI 9 NGINX
runtime image. They are not application dependencies introduced by the
console build. Each finding remains accepted until Red Hat publishes a fixed
package/image or the runtime base image is replaced. A subsequent scan must
refresh this record if the finding set changes.

## Evidence

- Runtime base: `registry.access.redhat.com/ubi9/nginx-126:1-1791969848`
- Runtime manifest digest: `sha256:0c3626527f8172f2d54ff67bb25ee286640572ff90a0002bcbe926a9c85ed079`
- Image scan: Trivy `0.72.0`, 2026-10-17
- Result: 39 HIGH package findings across 14 unique CVEs; 0 CRITICAL findings
- All listed findings had no fixed version in the Red Hat/Trivy result at scan time

## Accepted findings

| CVE | Severity/status | Affected package(s) | Disposition |
|---|---|---|---|
| CVE-2026-19445 | HIGH / end_of_life | `python3`, `python3-libs` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-19553 | HIGH / end_of_life | `python3`, `python3-libs` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-43961 | HIGH / affected | `vim-filesystem`, `vim-minimal` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-53613 | HIGH / affected | `util-linux` libraries | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-53615 | HIGH / affected | `util-linux` libraries | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-57585 | HIGH / affected | `python3-pip-wheel` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-76641 | HIGH / affected | `expat` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-77214 | HIGH / affected | `expat` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-79824 | HIGH / affected | `python3`, `python3-libs` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-88647 | HIGH / affected | `gnutls` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-88806 | HIGH / affected | `libX11`, `libX11-common` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-97205 | HIGH / affected | `nginx` modules | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-97687 | HIGH / affected | `python3-urllib3` | Accept pending an upstream fixed package or replacement runtime base. |
| CVE-2026-97689 | HIGH / affected | `python3-urllib3` | Accept pending an upstream fixed package or replacement runtime base. |

No CRITICAL finding was present in this scan. Fixable HIGH or CRITICAL findings
remain blocking if they appear in future scans.
