# Parcel Index — DocSpine v1

Coordination board. Coordinator (Clint) owns all merges, contract amendments, and dispatch order.
Strategy: `docs/STRATEGY-docspine.md`. Design source: `docs/design/llm-native-docs-system.md`.
Repo: `C:\Repos\docspine` · Base branch: `main` · Branch prefix: `feat/` · Worktrees: `C:\Repos\docspine.<parcel-id>`

## Status

| Parcel | Wave | Status | Worktree | Branch | PR | Assignee |
|--------|------|--------|----------|--------|-----|----------|
| w1-contracts-core | W1 | merged | n/a | feat/w1-contracts-core | e13e6be..ae118fc (local) | Claude |
| w1-fixture-repo | W1 | merged | n/a | feat/w1-fixture-repo | be78028 (local) | Claude |
| w1-spike-verify-paths | W1 | merged | n/a | feat/w1-spike-verify-paths | 86c105d (local) | Claude |
| w1-frontmatter-validate | W1 | dispatched | C:\Repos\docspine.w1-frontmatter-validate | feat/w1-frontmatter-validate | — | — |
| w1-extract-symbols | W1 | dispatched | C:\Repos\docspine.w1-extract-symbols | feat/w1-extract-symbols | — | — |
| w1-extract-commands | W1 | dispatched | C:\Repos\docspine.w1-extract-commands | feat/w1-extract-commands | — | — |
| w1-extract-links | W1 | dispatched | C:\Repos\docspine.w1-extract-links | feat/w1-extract-links | — | — |
| w1-check-symbols | W1 | merged | n/a | feat/w1-check-symbols | ea40a09 (local) | Claude |
| w1-check-commands | W1 | dispatched | C:\Repos\docspine.w1-check-commands | feat/w1-check-commands | — | — |
| w1-check-links | W1 | dispatched | C:\Repos\docspine.w1-check-links | feat/w1-check-links | — | — |
| w1-symbol-index-ts | W1 | merged | n/a | feat/w1-symbol-index-ts | ee42e1f (local) | Claude |
| w1-git-plumbing | W1 | dispatched | C:\Repos\docspine.w1-git-plumbing | feat/w1-git-plumbing | — | — |
| w1-report-writer | W1 | dispatched | C:\Repos\docspine.w1-report-writer | feat/w1-report-writer | — | — |
| w1-registry-wiring | W1 | merged | n/a | feat/w1-registry-wiring | — | serialized — coordinator-adjacent |
| w2-pipeline-audit | W2 | queued — spec not yet written | C:\Repos\docspine.w2-pipeline-audit | feat/w2-pipeline-audit | — | — |
| w2-drift-engine | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-drift-engine | feat/w2-drift-engine | — | — |
| w2-manifest-compile | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-manifest-compile | feat/w2-manifest-compile | — | — |
| w2-cli-wiring | W2 | **SPEC READY — Batch C (serialized, last)** | C:\Repos\docspine.w2-cli-wiring | feat/w2-cli-wiring | — | serialized |
| w2-provider-router | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-provider-router | feat/w2-provider-router | — | — |
| w2-adapter-openai-compat | W2 | queued (provider-router) | — | feat/w2-adapter-openai-compat | — | — |
| w2-schema-repair | W2 | queued (provider-router) | — | feat/w2-schema-repair | — | — |
| w2-lexical-similarity | W2 | queued (W1 exit) | — | feat/w2-lexical-similarity | — | — |
| w3-cache-packet-hash | W3 | queued (W2 exit) | — | feat/w3-cache-packet-hash | — | — |
| w3-budgets | W3 | queued (W2 exit) | — | feat/w3-budgets | — | — |
| w3-audit-log | W3 | queued (W2 exit) | — | feat/w3-audit-log | — | — |
| w3-health-checks | W3 | queued (W2 exit) | — | feat/w3-health-checks | — | — |
| w3-config-validation | W3 | queued (W2 exit) | — | feat/w3-config-validation | — | — |
| w3-dogfood-docs | W3 | queued (W2 exit) | — | feat/w3-dogfood-docs | — | coordinator-adjacent |

Status legend: queued · blocked (deps) · dispatched · in-review · merged · rejected

## W1 Parcel Summaries (specs at `docs/PARCELS/<parcel-id>.md`)

- **w1-contracts-core** — THE contracts PR. TS types + published JSON schemas for: doc frontmatter, manifest, audit report, claim record, `Extractor`/`Checker` plugin interfaces, `EvidencePacket`, `TaskRequest`/`TaskResult`, `CapabilitySet`, normalized error taxonomy. JSDoc on every ambiguous field. Fixture objects satisfying every schema, with ajv contract-satisfaction tests. Also writes `AGENTS.md` skeleton. No implementations, no UI, no CLI.
- **w1-fixture-repo** — `fixtures/messy-repo/`: a small fake project with intentional doc rot — broken path refs, stale symbol refs, a dead command, duplicated docs, a superseded ADR without a stub, an undocumented `src/` subsystem, one doc with valid frontmatter and one without. README documents every intentional defect and its expected finding (this doubles as the test oracle). Parallel-safe with contracts.
- **w1-spike-verify-paths** — Thin vertical spike. Pipeline skeleton: walk docs → parse frontmatter (minimal) → run registered extractors → run checkers → emit schema-valid report. Wires ONLY the path extractor + path checker (existence + `git log --follow` rename detection). Proves `Extractor`/`Checker`/report contracts end-to-end against the fixture repo. If contracts are wrong, we find out HERE, before parallel dispatch. Delivers `src/pipeline/`, `src/extractors/paths.ts`, `src/checkers/paths.ts`, provisional `src/registry.ts`.
- **w1-frontmatter-validate** — Full frontmatter parser/validator (gray-matter + ajv against the published schema); machine-field protection markers; actionable error output. Replaces the spike's minimal parse.
- **w1-extract-symbols / w1-extract-commands / w1-extract-links** — One pure extractor each, one file each, plugin-shaped. Backtick-fenced identifier extraction; fenced shell-block command extraction; markdown link/anchor extraction. No registry edits (see w1-registry-wiring).
- **w1-check-symbols / w1-check-commands / w1-check-links** — One pure checker each. Symbol existence against `SymbolIndex`; command allowlist smoke-check (package-script existence, `--help` policy — NEVER arbitrary execution); internal link/anchor resolution.
- **w1-symbol-index-ts** — `SymbolIndex` implementation for TS/JS via TypeScript compiler API. Language-agnostic contract, TS-only backend (locked in strategy §2).
- **w1-git-plumbing** — `diffSinceSha`, rename-follow helpers, material/cosmetic change classifier primitives. Pure wrappers over `git` CLI with typed output. Depends only on contracts.
- **w1-report-writer** — Deterministic report assembly: stable ordering, content hashing, envelope timestamps (strategy §6.5).
- **w1-registry-wiring** — SERIALIZED. Registers all merged extractors/checkers in `src/registry.ts`, replacing the spike's provisional registry. Last W1 parcel; single owner; trivial by design because every plugin lives in its own file.

## Dependency Graph

```
w1-contracts-core ─┬─► w1-spike-verify-paths ─┬─► w1-frontmatter-validate
w1-fixture-repo  ──┘                          ├─► w1-extract-symbols
                                              ├─► w1-extract-commands
                                              ├─► w1-extract-links
                                              ├─► w1-symbol-index-ts ─► w1-check-symbols
                                              ├─► w1-check-commands
                                              ├─► w1-check-links
                                              └─► w1-report-writer
w1-contracts-core ───► w1-git-plumbing        (parallel with spike; no pipeline dependency)

[all W1 extractors + checkers merged] ─► w1-registry-wiring ─► W1 EXIT

W1 EXIT ─┬─► w2-pipeline-audit ──┬─► w2-cli-wiring (serialized)
         ├─► w2-drift-engine ────┤
         ├─► w2-manifest-compile ┤
         ├─► w2-provider-router ─┬─► w2-adapter-openai-compat
         │                       └─► w2-schema-repair
         └─► w2-lexical-similarity

W2 EXIT ─► w3-* (parallel except w3-dogfood-docs, which lands last)
```

## Collision-Risk Files

| File | Owning parcels | Handling |
|------|----------------|----------|
| src/contracts/*.ts, schemas/*.json | w1-contracts-core only; amendments via Contract Amendment process | Frozen after merge |
| src/registry.ts | w1-spike-verify-paths (creates, provisional), w1-registry-wiring (finalizes) | Serialized; no other parcel touches it |
| package.json / lockfile | w1-contracts-core (initial deps); any later dep = spec amendment | Serialized |
| fixtures/messy-repo/** | w1-fixture-repo (creates); later parcels READ ONLY | Additions to fixtures require coordinator sign-off (it's the shared oracle) |
| src/pipeline/** | w1-spike-verify-paths (creates), w2-pipeline-audit (extends) | Sequenced across waves |
| src/cli/** | w2-cli-wiring only | Serialized |

## Wave Status

W1 (contracts + primitives): 14/14 merged · exit criteria: MET — W2 unblocked
W2 (assembly + provider layer): 0/8 merged · blocked by W1 exit
W3 (hardening + release readiness): 0/6 merged · blocked by W2 exit

## Contract Amendments

| Amendment | Contract | Affected Parcels | Status | Migration Note |
|-----------|----------|------------------|--------|----------------|
| ca-001 | STRATEGY §2 dependency policy | all W1/W2 parcels using `tsc`/`tsx --test` | merged | Added `@types/node` (dev-only) to the locked dependency set + `"types": ["node"]` in tsconfig.json. Surfaced by w1-contracts-core's stop-and-report; types-only, no runtime footprint. |
| ca-002 | STRATEGY §2 verification convention | all W1/W2 parcel specs citing `npx tsx --test tests/` | merged (w1-contracts-core.md, w1-spike-verify-paths.md updated; other specs not yet written) | Canonical command is bare `npx tsx --test` (no path arg) — an explicit path makes Node's test runner treat it as a script entrypoint, not a discovery root. Verification also requires Node ≥22 active (`nvm use 22`); Node 20's test runner does not discover `.ts` test files by default. |
| ca-003 | biome.json scope | w1-contracts-core (biome.json), interacts with w1-fixture-repo's tree | merged | `files.includes` excludes `fixtures/messy-repo` — that tree is inert fixture data with intentionally non-conforming formatting/lint characteristics, not lint-worthy source. |
| ca-004 | Extractor line-numbering convention (process note, not a type change) | w1-extract-symbols, w1-extract-commands, w1-extract-links (Batch 2, specs not yet written at time of this note) | merged (documented, no contract edit) | `Claim.line` must be the full-source-file (post-frontmatter) line number, but `Extractor.extract(doc: ParsedDoc)` only ever sees frontmatter-stripped `doc.body`. w1-spike-verify-paths's working convention (kept, not changed): extractors compute `Claim.line` relative to `doc.body`'s own first line (1-indexed); the pipeline (`run-verify.ts`) adds the frontmatter line offset before a claim leaves the pipeline. Every Batch-2 extractor spec must state this explicitly so authors don't re-derive or misalign it. |
| ca-005 | STRATEGY §2 `typescript` dependency pin | w1-symbol-index-ts (re-dispatched against the fix); any future parcel importing `typescript`'s compiler API | merged | Locked `typescript` at `^5.9.3` (classic compiler line), moved from `devDependencies` to `dependencies`. `^7.0.2` (as originally locked) resolves to TypeScript's native/"tsgo" rewrite, whose npm package exports only a version stub as its main entrypoint — the in-process parser API (`createSourceFile`, `createProgram`) doesn't exist there, only `tsc` CLI (native binary shim) and narrow `./unstable/*` subpaths. `tsc --noEmit` kept working throughout because it only ever needs the CLI shim, masking the gap until a parcel needed the in-process API. All 139 tests + tsc + biome reverified clean post-downgrade. |
| ca-006 | fixtures/messy-repo/docs/canon/malformed-frontmatter.md content | w1-frontmatter-validate (surfaced it); no spec/type change | merged | Fixture doc was missing `last_verified_sha`/`last_verified_at`/`drift_tolerance` (all schema-required) in addition to its two intended defects (bad `kind` enum, missing `owner`) — real validator found 5 errors, oracle documented 2. Added the three fields back with correct not-yet-verified values so the doc exercises exactly its documented two defects again. Coordinator sign-off per `fixtures/README.md`'s post-merge change rule; `verify-inventory.ps1` still exits 0. |

## Open Decisions Needed

None blocking. Resolved by coordinator 2026-07-09:

1. **Repo home: RESOLVED — personal/separate-entity repo.** No company org, no company hardware/accounts, no company secrets or company-specific docs, no employer time. Clean ownership boundary from commit zero; licensing to third parties remains possible later. (Work-for-hire ambiguity is expensive; a repo boundary is cheap.)
2. **Fixture-repo language mix: RESOLVED — keep Python defect #12.** Status stays within the closed FindingStatus union (`unverifiable`); `unverifiable_symbol_language` is a detail substring, never a fifth status.

Deferred, non-blocking (from w1-spike-verify-paths review, 2026-07-10):

3. **Doc-discovery scope for `walkDocs`.** Currently walks all `*.md` under the repo root unconditionally (per design spec §8 Step 1's literal wording), which means a doc's own meta-content (e.g. `fixtures/messy-repo/EXPECTED-FINDINGS.md`, which itself contains backtick-fenced paths describing the fixture's intentional defects) gets walked and claim-extracted like any other doc — inflating/duplicating counts against the "real" canon docs. Does not block or fail any current test (per-doc assertions, not corpus-wide counts) but will matter more at the W3 dogfood-on-real-repo gate (`docs/PARCELS/*.md`, `STRATEGY-docspine.md` reference many real paths in prose). Options for later: restrict to `docs/**`, restrict to frontmatter-bearing files only, or accept the noise as correct (the tool finding real path claims in real prose, wherever it lives). Revisit at W2 manifest-compile or W3 dogfood, not now.

## Dispatch Order

0. **Repo creation (coordinator, done outside parcels):** create personal/separate-entity repo → bare-init commit (README only) on `main`. DONE 2026-07-09.
1. **Batch 0 (parallel):** w1-contracts-core, w1-fixture-repo
2. **Merge sequencing within Batch 0:** merge contracts FIRST if possible; reconcile fixture EXPECTED-FINDINGS vocabulary against merged contracts (especially defect #12's closed-union status) before merging fixture.
3. **Batch 1 (single, sequenced):** w1-spike-verify-paths — DONE, merged 2026-07-10. Contracts survived contact with reality with zero amendments required (see ca-004 for the one process note baked into Batch 2 specs below).
4. **Batch 2 (parallel, wide):** w1-frontmatter-validate, w1-extract-symbols, w1-extract-commands, w1-extract-links, w1-check-commands, w1-check-links, w1-symbol-index-ts, w1-report-writer, w1-git-plumbing — specs being authored now that the spike has merged clean
5. **Batch 3 (parallel, small):** w1-check-symbols (needs symbol-index-ts)
6. **Batch 4 (single, serialized):** w1-registry-wiring → verify W1 exit criteria → gate W2

*Contracts before parallel fork. One parcel, one branch, one worktree. This is the way.*
