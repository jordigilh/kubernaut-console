# Standalone image scan exception record

## Current review — 2026-10-31

PR #160 refreshes the runtime base to
`registry.access.redhat.com/ubi9/nginx-126:1-1793251909` at manifest-list digest
`sha256:afe4a17857e88905b559b28d61bfa6dd4169a79bde381b4c5dec3cf46608dd70`.
The timestamped tag and digest were independently resolved from the Red Hat
registry; the manifest list includes both `linux/amd64` and `linux/arm64`.
The build-stage pin, runtime `USER 1001`, and CI/release scan policies are unchanged.

Local Trivy 0.72.0 scans of that exact base on both architectures report **zero
fixable HIGH or CRITICAL findings** under the existing PR gate. This is base-image
evidence, not a deployed qualification or a claim that the image has no known
vulnerabilities. CI separately builds and scans the complete application image.
With the same local database, the preceding runtime digest
`sha256:c9d399b0bded6388a54addc7f3f4096f84bfff9f49790393acf23e6f8569db78`
reports 11 fixable package findings (10 HIGH and 1 CRITICAL across 8 CVEs).
CI also asserts runtime user `1001` and checks that `GET /` serves the built
application entry point before scanning the complete image.

The unfiltered `linux/amd64` HIGH/CRITICAL scan still reports **39 HIGH package
findings across 10 CVEs, zero CRITICAL**, all without a supplied fixed version:

| CVE | Affected package(s) | Current disposition |
|---|---|---|
| CVE-2026-43961 | `vim-filesystem`, `vim-minimal` | Existing unfixed exception, pending upstream fix. |
| CVE-2026-53613 | `util-linux` and its libraries | Existing unfixed exception, pending upstream fix. |
| CVE-2026-53615 | `util-linux` and its libraries | Existing unfixed exception, pending upstream fix. |
| CVE-2026-57585 | `python3-pip-wheel` | Existing unfixed exception, pending upstream fix. |
| CVE-2026-76641 | `expat` | Existing unfixed exception, pending upstream fix. |
| CVE-2026-97205 | `nginx` and its modules | Existing unfixed exception, pending upstream fix. |
| CVE-2026-15176 | `nginx` and its modules | Newly observed unfixed risk; maintainer disposition required. |
| CVE-2026-114613 | `python3-pip-wheel` | Newly observed unfixed risk; maintainer disposition required. |
| CVE-2026-119373 | `sqlite-libs` | Newly observed unfixed risk; maintainer disposition required. |
| CVE-2026-119586 | `sqlite-libs` | Newly observed unfixed risk; maintainer disposition required. |

The unchanged `ignore-unfixed` policy is not a new approval of those newly
observed risks. Review them on the existing weekly cadence and when upstream
fixes become available. Do not add ignores, reduce severity, disable scanners or
relax the fixable-vulnerability gate. The original snapshot below remains as
historical evidence; its resolved entries are not claims about the current base.

## Historical exception snapshot — 2026-10-17

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
