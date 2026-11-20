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
| w1-frontmatter-validate | W1 | merged | n/a | feat/w1-frontmatter-validate | — | Claude |
| w1-extract-symbols | W1 | merged | n/a | feat/w1-extract-symbols | — | Claude |
| w1-extract-commands | W1 | merged | n/a | feat/w1-extract-commands | — | Claude |
| w1-extract-links | W1 | merged | n/a | feat/w1-extract-links | — | Claude |
| w1-check-symbols | W1 | merged | n/a | feat/w1-check-symbols | ea40a09 (local) | Claude |
| w1-check-commands | W1 | merged | n/a | feat/w1-check-commands | — | Claude |
| w1-check-links | W1 | merged | n/a | feat/w1-check-links | — | Claude |
| w1-symbol-index-ts | W1 | merged | n/a | feat/w1-symbol-index-ts | ee42e1f (local) | Claude |
| w1-git-plumbing | W1 | merged | n/a | feat/w1-git-plumbing | — | Claude |
| w1-report-writer | W1 | merged | n/a | feat/w1-report-writer | — | Claude |
| w1-registry-wiring | W1 | merged | n/a | feat/w1-registry-wiring | 48bc338 (local) | serialized — coordinator-adjacent |
| w2-provider-router | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-provider-router | feat/w2-provider-router | — | — |
| w2-pipeline-audit | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-pipeline-audit | feat/w2-pipeline-audit | — | — |
| w2-drift-engine | W2 | **SPEC READY — Batch A** (approved 2026-08-06) | C:\Repos\docspine.w2-drift-engine | feat/w2-drift-engine | — | — |
| w2-manifest-compile | W2 | **SPEC READY — Batch A** (approved 2026-08-06) | C:\Repos\docspine.w2-manifest-compile | feat/w2-manifest-compile | — | — |
| w2-lexical-similarity | W2 | **SPEC READY — Batch A** | C:\Repos\docspine.w2-lexical-similarity | feat/w2-lexical-similarity | — | — |
| w2-evidence-packet | W2 | spec pending — Batch B (salvaged from killed spike; see decision 4) | — | feat/w2-evidence-packet | — | — |
| w2-adapter-openai-compat | W2 | spec pending — Batch B (blocked: provider-router types) | — | feat/w2-adapter-openai-compat | — | — |
| w2-schema-repair | W2 | spec pending — Batch B (blocked: provider-router types) | — | feat/w2-schema-repair | — | — |
| w2-config-load | W2 | **SPEC READY — Batch C** (ca-007 approved: Option A) | C:\Repos\docspine.w2-config-load | feat/w2-config-load | — | serialized |
| w2-cli-wiring | W2 | **SPEC READY — Batch C** (serialized, last) | C:\Repos\docspine.w2-cli-wiring | feat/w2-cli-wiring | — | serialized |
| ~~w2-spike-provider-echo~~ | W2 | **KILLED 2026-08-06** — superseded by w2-provider-router (see decision 4) | n/a | n/a | n/a | n/a |
| follow-up-historical-api-signatures | follow-up | queued — initial v1 reports `covers_apis` signatures UNEVALUATED; needs deterministic historical symbol indexing/signature comparison before API-level drift can be claimed | — | — | — | coordinator |
| w3-cache-packet-hash | W3 | queued (W2 exit) | — | feat/w3-cache-packet-hash | — | — |
| w3-budgets | W3 | queued (W2 exit) | — | feat/w3-budgets | — | — |
| w3-audit-log | W3 | queued (W2 exit) | — | feat/w3-audit-log | — | — |
| w3-health-checks | W3 | queued (W2 exit) | — | feat/w3-health-checks | — | — |
| w3-config-validation | W3 | queued (W2 exit) | — | feat/w3-config-validation | — | — |
| w3-dogfood-docs | W3 | queued (W2 exit) | — | feat/w3-dogfood-docs | — | coordinator-adjacent |

Status legend: queued · blocked (deps) · dispatched · in-review · merged · rejected

## W2 Parcel Summaries

**Batch A — parallel, no interdependencies. Every parcel takes typed options as parameters; none reads a config file (decision 5).**

- **w2-provider-router** — Provider registry + task router. Structural network gate (`allowNetworkProviders: false` means network adapters are *never constructed*, proven by factory-invocation spy), non-throwing degradation to `skipped`, pre-call budgets, and a static import-boundary test making tier separation mechanically checked. Defines `RouterConfig`/`ProviderConfig`/`AdapterFactories` in `src/llm/types.ts` — effectively mini-contracts for Batch B.
- **w2-pipeline-audit** — Full T0 audit pipeline: inventory, all four claim kinds, `DocScore` staleness scoring, coverage-gap analysis. Emits complete `AuditReport` with `analysisDepth: "t0-only"`. Leaves `contradictions: []` rather than stubbing T1 output.
- **w2-drift-engine** — The freshness mechanism. `computeDrift` (pure) intersects `covers` globs with commits since `last_verified_sha`; `applyDrift` is the single sanctioned writer of machine-owned frontmatter and may only move `verified → stale`, never promote.
- **w2-manifest-compile** — `docs/manifest.json` + `INDEX.md` from frontmatter. Byte-stable, embeds `trustRulesDigest`, routes only `status: verified` docs, excludes `history`/`scratch` from routes and packets unconditionally.
- **w2-lexical-similarity** — Model-free duplicate detection (markdown-aware tokenizer, TF-IDF, MinHash, clustering). Zero deps, zero network, deterministic seeds. Makes the zero-provider W2 exit criterion real. Produces similarity clusters only — never classifies a pair as contradictory (that is a T1 judgment).

**Batch B — parallel; all blocked on `src/llm/types.ts` from w2-provider-router.**

- **w2-evidence-packet** — `buildEvidencePacket()` assembly from real repo data, `packetHash()` (stable content hash; `w3-cache-packet-hash` and `w3-audit-log` consume it), and **redaction enforcement** with a test asserting a known source string present unredacted is absent when `redactSourceBeforeRemoteCalls` is on. Salvaged from the killed spike — these were its only non-redundant deliverables and no other parcel owned them.
- **w2-adapter-openai-compat** — The single v1 adapter. Covers OpenAI, Azure, vLLM, Ollama, LM Studio, llama.cpp. Structured-output ladder (native schema → JSON mode → prompt-and-parse), capability probing, budget enforcement before the wire call, error normalization to `ProviderErrorCode`.
- **w2-schema-repair** — Deterministic re-prompt with validator errors, max 2 retries, then advisory-soft failure (logged, skipped, never fabricated). Router calls it as a hook.

**Batch C — serialized, in this order, last.**

- **w2-config-load** — `.docaudit/config.yaml` schema, loader, defaults. Missing file is legal (full defaults); safe defaults are restrictive (`allowNetworkProviders: false`, `redactSourceBeforeRemoteCalls: true`); invalid config yields config-plus-errors, never silent degradation. Produces the router's own `RouterConfig` type rather than a parallel shape. Rich `--explain` diagnostics remain `w3-config-validation`.
- **w2-cli-wiring** — `docaudit audit | verify | drift | compile` via commander. The **only** module that reads config files and maps `DocSpineConfig` → `RouterConfig`. Sole owner of `src/cli/**`.

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

W1 EXIT ─┬─► w2-provider-router ──┬─► w2-evidence-packet ──────┐
         │   (defines src/llm/    ├─► w2-adapter-openai-compat │
         │    types.ts)           └─► w2-schema-repair ────────┤
         ├─► w2-pipeline-audit ───────────────────────────────┤
         ├─► w2-drift-engine ─────────────────────────────────┤
         ├─► w2-manifest-compile ─────────────────────────────┤
         └─► w2-lexical-similarity ───────────────────────────┤
                                                              ▼
                                    w2-config-load ─► w2-cli-wiring (serialized)
                                                              │
                                                          W2 EXIT

Batch A = provider-router, pipeline-audit, drift-engine, manifest-compile,
          lexical-similarity   (all parallel; typed params, no config file reads)
Batch B = evidence-packet, adapter-openai-compat, schema-repair
          (parallel; need src/llm/types.ts)
Batch C = config-load ─► cli-wiring   (serialized, last)

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
| src/llm/types.ts | w2-provider-router (creates) | **Mini-contract.** `RouterConfig`, `ProviderConfig`, `AdapterFactories`, repair-hook signature. Batch B + w2-config-load build against it; post-merge changes are amendment-worthy |
| src/llm/** (rest) | w2-provider-router, then w2-evidence-packet / w2-adapter-openai-compat / w2-schema-repair in own files | One file per parcel; no shared-file edits within Batch B |
| src/drift/** | w2-drift-engine only | Sole owner |
| src/manifest/** | w2-manifest-compile only | Sole owner |
| src/similarity/** | w2-lexical-similarity only | Sole owner |
| src/config/** | w2-config-load only | Sole owner; imports types from src/llm/types.ts |
| src/frontmatter/machine-fields.ts | w1-frontmatter-validate (created); w2-drift-engine reads it | Read-only for W2; only `src/drift/apply.ts` writes machine-owned fields |
| src/cli/** | w2-cli-wiring only | Serialized |

## Wave Status

W1 (contracts + primitives): 14/14 merged · exit criteria: MET — W2 unblocked
W2 (assembly + provider layer): 0/10 merged · Batch A dispatchable now
  Batch A: 0/5 · Batch B: 0/3 (specs pending) · Batch C: 0/2
W3 (hardening + release readiness): 0/6 merged · blocked by W2 exit

Post-W1 verification (2026-08-06, commit 1414dab): `npm ci` from clean tree →
26 packages, 0 vulnerabilities; `npm run verify` → tsc clean, biome clean
(56 files), 160/160 tests pass; spike-verify against fixture → 11 docs,
68 claims, ok=45 broken=14 moved=3 unverifiable=6; verify-inventory →
19 oracle rows resolve, defects 1-13 present.

## Contract Amendments

| Amendment | Contract | Affected Parcels | Status | Migration Note |
|-----------|----------|------------------|--------|----------------|
| ca-001 | STRATEGY §2 dependency policy | all W1/W2 parcels using `tsc`/`tsx --test` | merged | Added `@types/node` (dev-only) to the locked dependency set + `"types": ["node"]` in tsconfig.json. Surfaced by w1-contracts-core's stop-and-report; types-only, no runtime footprint. |
| ca-002 | STRATEGY §2 verification convention | all W1/W2 parcel specs citing `npx tsx --test tests/` | merged (w1-contracts-core.md, w1-spike-verify-paths.md updated; other specs not yet written) | Canonical command is bare `npx tsx --test` (no path arg) — an explicit path makes Node's test runner treat it as a script entrypoint, not a discovery root. Verification also requires Node ≥22 active (`nvm use 22`); Node 20's test runner does not discover `.ts` test files by default. |
| ca-003 | biome.json scope | w1-contracts-core (biome.json), interacts with w1-fixture-repo's tree | merged | `files.includes` excludes `fixtures/messy-repo` — that tree is inert fixture data with intentionally non-conforming formatting/lint characteristics, not lint-worthy source. |
| ca-004 | Extractor line-numbering convention (process note, not a type change) | w1-extract-symbols, w1-extract-commands, w1-extract-links (Batch 2, specs not yet written at time of this note) | merged (documented, no contract edit) | `Claim.line` must be the full-source-file (post-frontmatter) line number, but `Extractor.extract(doc: ParsedDoc)` only ever sees frontmatter-stripped `doc.body`. w1-spike-verify-paths's working convention (kept, not changed): extractors compute `Claim.line` relative to `doc.body`'s own first line (1-indexed); the pipeline (`run-verify.ts`) adds the frontmatter line offset before a claim leaves the pipeline. Every Batch-2 extractor spec must state this explicitly so authors don't re-derive or misalign it. |
| ca-005 | STRATEGY §2 `typescript` dependency pin | w1-symbol-index-ts (re-dispatched against the fix); any future parcel importing `typescript`'s compiler API | merged | Locked `typescript` at `^5.9.3` (classic compiler line), moved from `devDependencies` to `dependencies`. `^7.0.2` (as originally locked) resolves to TypeScript's native/"tsgo" rewrite, whose npm package exports only a version stub as its main entrypoint — the in-process parser API (`createSourceFile`, `createProgram`) doesn't exist there, only `tsc` CLI (native binary shim) and narrow `./unstable/*` subpaths. `tsc --noEmit` kept working throughout because it only ever needs the CLI shim, masking the gap until a parcel needed the in-process API. All 139 tests + tsc + biome reverified clean post-downgrade. |
| ca-006 | fixtures/messy-repo/docs/canon/malformed-frontmatter.md content | w1-frontmatter-validate (surfaced it); no spec/type change | merged | Fixture doc was missing `last_verified_sha`/`last_verified_at`/`drift_tolerance` (all schema-required) in addition to its two intended defects (bad `kind` enum, missing `owner`) — real validator found 5 errors, oracle documented 2. Added the three fields back with correct not-yet-verified values so the doc exercises exactly its documented two defects again. Coordinator sign-off per `fixtures/README.md`'s post-merge change rule; `verify-inventory.ps1` still exits 0. |
| ca-007 | STRATEGY §2 dependency policy — YAML parsing | w2-config-load; indirectly w2-cli-wiring | **APPROVED (Option A)** | Design spec §25 specifies `.docaudit/config.yaml`. Approved Option A: add `js-yaml` + `@types/js-yaml` explicitly in `w2-config-load` (already present transitively via `gray-matter`, ~zero net install cost; stays aligned with spec §25). |
| ca-008 | Environment + install-path hardening (no contract change) | all parcels | merged (1414dab) | `NODE_ENV=production` made npm silently omit devDependencies, producing installs that reported success but could not build, lint, or test. Now blocked by a zero-dep `preinstall` guard (`scripts/check-env.mjs`; escape hatch `DOCSPINE_ALLOW_PROD_INSTALL=1`), verified against four cases including cmd's trailing-space `set X=production &&` variant. Node ≥22 machine-enforced via `engine-strict=true` (ca-002's human convention made mechanical). Lockfile regenerated — it was missing every platform-optional dep, so `npm ci` failed on a fresh clone. `fast-uri` 3.1.3→3.1.5 clears a high-severity advisory. **Canonical gate is now `npm run verify`** (build + lint + test); every W2 spec cites it. |
| ca-009 | `src/contracts/report.ts` `DocScore.brokenClaimRatio` semantics | `run-verify.ts`, `w2-pipeline-audit` | merged | Reconciled contract JSDoc and `run-verify.ts` with `w2-pipeline-audit`: `brokenClaimRatio` is `(broken + moved) / (ok + broken + moved)`, excluding `unverifiable` from both numerator and denominator so missing language indexers/checkers do not masquerade as doc rot. |

### ca-010 — document diagnostics (owner-authorized prerequisite)

- Contract: `src/contracts/report.ts`, `schemas/report.schema.json`; consumer: `w2-pipeline-audit`.
- Status: approved by the owner's prerequisite assignment; implementation in this prerequisite PR (not a TASK-01 retry).
- Adds optional `AuditReport.documentDiagnostics`: `{ path, code, message }[]`, where `path` is a repo-relative POSIX file path without dot segments, `code` is `unreadable_document` or `invalid_frontmatter`, and `message` is actionable. No fabricated claims or scoring of document failures.
- Migration: existing report JSON remains valid with the field omitted. Canonicalization preserves omission and sorts present entries by `(path, code, message)`. `runVerify` retains its unreadable-document skip behavior; the audit parcel produces diagnostics separately. No other frozen contract is changed.

### Drift prerequisite and historical-signatures follow-up

`src/git/path-history.ts` is the reusable path-based prerequisite, not the drift engine: typed unavailable-vs-empty results, per-commit raw NUL-delimited changes, conservative material classification, explicit contract globs, and all-commits/first-parent-diff merge policy. Legacy `src/git/plumbing.ts` behavior remains unchanged. Side edits can count again at merge integration; all whitespace/comment/rename events remain material absent a language-aware proof.

**follow-up-historical-api-signatures** (queued, not an existing TASK status change): add deterministic historical symbol indexing and compare `covers_apis` additions/removals/signatures at baseline and HEAD, including missing/unavailable-history tests. The current `SymbolIndex` only indexes the working tree. Initial v1 uses covered paths plus explicit `contractPaths` globs and reports historical signature comparison as **unevaluated**, never as "no API change". This prerequisite does not implement either engine or the follow-up.

## Open Decisions Needed

No blocking open decisions. (ca-007 resolved to Option A: `js-yaml` + `@types/js-yaml`.)

Resolved by coordinator 2026-07-09:

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
