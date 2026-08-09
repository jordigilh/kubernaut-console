# Kubernaut Console — Agent Guidelines

This file complements [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/development.md`](docs/development.md),
which remain authoritative for repo structure, setup, and workflow. This file covers tool
selection for AI coding agents specifically.

---

## Detection Commands: Prefer MCP Tools Over grep/rg

**Preference hierarchy**: `cocoindex_search` MCP > grep/rg

This repo has no language-server-backed MCP (no Go here), but it does have `cocoindex_search`
-- a semantic code search MCP server indexed over the whole repo. Use it instead of grep/rg
whenever you're searching by concept or don't know the exact identifier:

```
cocoindex_search(query="how does the A2A mock mode work", limit=10)
cocoindex_search(query="where is the OCM dynamic plugin registered", limit=10)
cocoindex_search(query="existing usage of the ui-core theme provider", limit=10)
```

Pre-configured in Cursor as `cocoindex-code`. For other MCP-compatible agents, add the same
server (`~/.hindsight/cocoindex-search.py`) to your MCP configuration.

**grep/rg is still fine for**:
- Literal string/regex matching cocoindex_search can't do (e.g. scanning for a specific env
  var name, a lint anti-pattern, or an exact import path across all packages)
- Parsing command output (build logs, test output, `git diff`)
- When `cocoindex_search` is unavailable for this workspace

**Avoid defaulting to grep/rg for**:
- "How does X work" / "where do we handle Y" -- semantic questions where you don't know the
  exact symbol or file already
- Finding likely callers/usages of a component when the name might vary (prop drilling,
  re-exports, renamed imports across `packages/*`)

---

## TypeScript/React Symbol Lookups

No MCP language server is configured for this repo yet. Until one is added, use your editor's
"Go to Definition" / "Find All References" (backed by the TypeScript language server) for
precise symbol lookups rather than grep, since it understands types and re-exports across the
`packages/*` workspace boundaries that grep does not.
