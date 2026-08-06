# DocSpine

A manifest-first, machine-verified documentation system for agent-ready repos.

Docs are treated as **claims about code**, not prose to be trusted. A deterministic
verifier checks every claim that can be checked — referenced paths exist, symbols
resolve, commands are real, links land — and reports the ones that don't.

Design spec: [`docs/design/llm-native-docs-system.md`](docs/design/llm-native-docs-system.md)
Build strategy: [`docs/STRATEGY-docspine.md`](docs/STRATEGY-docspine.md)
Agent entrypoint: [`AGENTS.md`](AGENTS.md)

## Status: W1 complete (deterministic core)

Honest scope, because this repo refuses to overstate its own state:

**Working today** — the T0 verification core. Claim extraction and checking for
all four claim kinds (paths, symbols, commands, links), frontmatter validation
with machine-field protection, git plumbing (diff-since-SHA, rename detection),
a TypeScript/JavaScript symbol index, and deterministic report emission.

**Not built yet** — the CLI (`docaudit audit | verify | drift | compile`), the
manifest compiler and routing layer, the drift engine, and the provider
abstraction for all LLM-assisted (advisory/draft) analysis. Those are W2/W3.

There is currently **no installable binary**. The only runnable entrypoint is the
verification spike described below.

## Requirements

- Node **>= 22** — Node 20's test runner does not discover `.ts` test files and
  will silently collect zero tests (amendment ca-002). Enforced via
  `engine-strict`.
- Git on `PATH` (rename detection and drift shell out to `git`).
- PowerShell 7 (`pwsh`) for the fixture setup script.

> **`NODE_ENV=production` will break your install.** npm derives `omit=dev` from
> it and skips the entire verification toolchain, producing an install that
> reports success but cannot build, lint, or test. A `preinstall` guard now fails
> loudly instead of letting this pass silently — run `npm run check-env` to test
> your shell.

## Setup

```bash
npm ci          # preinstall guard runs first; fails loudly on a bad environment
npm run verify  # build (tsc --noEmit) + lint (biome) + test (node:test via tsx)
```

Expected: `tsc` clean, `biome` clean, all tests passing.

## Try the verifier

The repo ships a deliberately messy fixture repo with 13 cataloged documentation
defects and an oracle (`fixtures/messy-repo/EXPECTED-FINDINGS.md`) that names the
exact finding each defect should produce — including two control negatives, so
the suite tests precision and not just recall.

```powershell
pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-demo
npx tsx scripts/spike-verify.ts $env:TEMP\ds-demo
```

The fixture needs seeded git history (the setup script provides it) because
rename detection is a git operation. Run against a temp copy, never the checked-in
tree.

## How this repo is built

Parcel-driven development: contracts land first, a thin vertical spike proves them
against reality, then implementation parcels fork in parallel against frozen
contracts. Board and per-parcel specs live in [`docs/PARCELS/`](docs/PARCELS/);
contract amendments are recorded in the index rather than applied silently.

## License

UNLICENSED — all rights reserved.
