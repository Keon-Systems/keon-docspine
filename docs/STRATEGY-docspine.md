# STRATEGY — DocSpine v1 (docaudit CLI + provider layer)

**Status:** Approved — coordinator sign-off 2026-07-09; Batch 0 cleared for dispatch
**Coordinator:** Clint Morgan
**Source of truth for design:** `docs/design/llm-native-docs-system.md` (the full DocSpine spec, Parts I & II). Every parcel spec points here for "why."
**Methodology:** parcel-driven development (PDD) — contract-first, parcel-sized agent work; coordinator owns contracts, dependency graph, and merges

---

## 1. Feature Surface and Why It Matters

DocSpine is an agent-ready documentation substrate: a deterministic verifier (`docaudit`) that checks documentation claims against code, a generated manifest that routes agents to canonical truth, and a provider-neutral LLM layer for advisory analysis and draft generation.

v1 scope is the **CLI product**: `docaudit audit | verify | drift | compile`, the frontmatter/manifest/report schemas, and the provider abstraction with a single `openai-compatible` adapter. v1 explicitly excludes the GitHub App / PR bot (that is the v2 commercial wedge and it consumes v1's report format unchanged).

Why now: the audit report is the sellable wedge (spec §17), the deterministic core is the moat (spec §18, T0), and every week without it, our own repos accumulate doc debt that agents pay for in tokens and mistakes.

## 2. Repo Constraints (Phase -1 output — greenfield edition)

This is a new repo. Constraints below are **decided and locked**, not discovered. Every parcel spec inherits them implicitly.

| Constraint | Locked value | Rationale |
|---|---|---|
| Repo | Personal/separate-entity repo (RESOLVED 2026-07-09). Local clone at `C:\Repos\docspine` on personal hardware. No company org, accounts, secrets, or company-specific docs; no employer time | Clean IP boundary from commit zero; portfolio thesis; licensing to third parties remains possible later |
| Base branch | `main` | Greenfield; trunk-based |
| Branch prefix | `feat/` | Trunk-based convention |
| Worktrees | `C:\Repos\docspine.<parcel-id>` | Skill-standard pattern |
| Language/runtime | TypeScript, Node ≥ 22 | Coordinator's standard toolchain; `node:` builtins preferred |
| Package layout | Single package, `src/` modular. No monorepo/workspaces in v1 | Workspaces are premature; split when the MCP server or GitHub App lands |
| Test runner | `node --test` via `npx tsx --test` (bare, no path argument — passing an explicit path like `tests/` makes Node treat it as a script entrypoint instead of triggering recursive test discovery) | Matches established precedent; zero test-framework deps |
| Module system | ESM only | It's 2026 |
| Lint/format | `biome` (single tool, single config) | One dep instead of eslint+prettier constellation |
| CLI framework | `commander` | Boring, stable, sufficient |
| Dependency policy | Minimal, pinned: `commander`, `gray-matter` (frontmatter), `picomatch` (globs), `ajv` (JSON-schema validation), `typescript` (**pinned `^5.9.3`, runtime dependency — not dev-only, see below**), plus `@types/node` and `@types/picomatch` (dev-only, types-only). Everything else is `node:` builtins. **Adding any other dependency requires a spec amendment.** | Deps are attack surface and Windows-build risk; `@types/*` packages are exempted from the runtime-risk rationale because they ship zero runtime code |
| `typescript` version pin (ca-005) | **Locked at `^5.9.3`, NOT the `^7.x` "tsgo" native-rewrite line**, and moved from `devDependencies` to `dependencies`. Discovered during `w1-symbol-index-ts`: TypeScript's npm package at `7.0.2`+ is the native (Go-compiled) rewrite — its default export is a version stub, the classic in-process compiler API (`ts.createSourceFile`, `ts.createProgram`, the full JS-hosted parser) does not exist there at all, only `tsc` CLI (shelling out to a native binary) plus narrow `./unstable/*` subpaths (an LSP-style sync/async server API, and AST/scanner utilities with no parser entry point). `docaudit`'s symbol index needs the real in-process parser at runtime (design spec's own "parser-only, no Program" architecture assumes it exists) — `5.9.3` is the last classic release that has it. All 139 tests + tsc + biome reverified clean after the downgrade; no code changed to compensate. | A parser reimplementation (hand-rolled token scanner) was seriously considered and built once, then reverted here — see w1-symbol-index-ts's PR history — because building foundational tooling correctness on a bespoke scanner instead of a mature, battle-tested parser is exactly the kind of technical debt this methodology exists to avoid at a load-bearing layer |
| Symbol indexing (v1) | TypeScript/JavaScript only, via the TypeScript compiler API. The `SymbolIndex` contract is language-agnostic; tree-sitter backends are post-v1 | Native tree-sitter bindings are a Windows-build tarpit; don't put them on the critical path |
| Commit messages | `git commit -F <msgfile>`, never inline `-m` | Coordinator tooling convention (avoids shell-quoting hazards) |
| Agent instructions | `AGENTS.md` written as part of contracts parcel; DocSpine dogfoods its own entrypoint format from day one | — |
| Serialization points (known at birth) | `src/registry.ts` (extractor/checker registration), `package.json` + lockfile, `schemas/*.json`, `src/contracts/*.ts` | Tracked in parcel index; sequenced touches only |

## 3. What Exists Today (preserve)

- The full design spec (Parts I & II) — unusually complete; contracts in §5, §8, §19 are near-transcribable into TypeScript.
- The tier model (T0–T3): **load-bearing from commit one.** No code path may let a model output mutate a doc status. This is an architectural invariant, not a feature.
- Established PDD muscle memory, worktree hygiene, and a fixture-first testing pattern from prior projects.

## 4. What's Missing (priority-ordered)

1. **Contracts as code.** Frontmatter schema, manifest schema, audit-report schema, `EvidencePacket`, `TaskRequest`/`TaskResult`, `CapabilitySet`, error taxonomy, `Extractor`/`Checker` plugin interfaces — plus fixtures.
2. **The fixture repo.** A deliberately messy sample repo (`fixtures/messy-repo/`) with broken paths, stale claims, duplicated docs, a dead ADR, an undocumented subsystem. Every parcel verifies against it. Over-invest here — it is the shared test bed and the demo asset.
3. **The deterministic pipeline (T0):** walk → parse frontmatter → extract claims → check claims → score → report.
4. **Git plumbing:** diff-since-SHA, rename-follow, material/cosmetic change classification.
5. **Manifest compiler** (`compile`) and **drift engine** (`drift`).
6. **Provider layer:** router, budgets, schema repair, one `openai-compatible` adapter, capability probe.
7. **T1 advisory tasks** wired through the provider layer: classify, duplicates (lexical fallback path first), stale summaries.
8. **Hardening:** caching by packet hash, audit logging (JSONL), health checks, config validation, dogfooded docs.

## 5. Wave Structure and Exit Criteria

### W1 — Contracts + Deterministic Primitives
Entry: this doc approved; repo initialized with toolchain skeleton.
Exit criteria:
- Contracts parcel merged: all schemas as TS types **and** published JSON schemas, with fixtures and contract-satisfaction tests.
- Fixture repo merged and referenced by ≥ 3 parcel test suites.
- Thin vertical spike merged: `docaudit verify fixtures/messy-repo` runs end-to-end with the **path** extractor/checker only, emitting a schema-valid report.
- All W1 primitive parcels (extractors, checkers, frontmatter validator, symbol indexer, git plumbing, report writer) merged with green tests.
- Zero unresolved interface decisions; zero contract amendments open.

### W2 — Assembly + Provider Layer
Entry: W1 exit criteria checkably true.
Exit criteria:
- `audit`, `verify`, `drift`, `compile` all functional against the fixture repo AND against one real repo (dogfood target: docspine itself or another local repo with real doc debt).
- Manifest compiles deterministically (byte-stable given identical input).
- Provider router + `openai-compatible` adapter + schema repair merged; `detect_duplicates` works with **zero providers configured** (lexical fallback), proving T1 degradation behavior.
- `allow_network_providers: false` verified by test: network adapters are not constructed.
- No silent product decisions outstanding.

### W3 — Hardening + Release Readiness
Entry: W2 exit criteria checkably true.
Exit criteria:
- Result caching, budget enforcement, provider audit log (JSONL), health checks merged.
- Config file fully validated with actionable error messages.
- **Dogfood gate:** DocSpine's own `docs/` passes `docaudit audit` with zero broken claims; its manifest compiles clean; `AGENTS.md` routes correctly. This is the acceptance test from spec §16, applied to ourselves.
- README + install path good enough that a stranger runs an audit in < 5 minutes.
- Security-review skill run against the repo; findings dispositioned.

## 6. Decisions Locked (so agents never have to make them)

1. **Tier separation is structural.** T1/T2 result types carry `advisory: true`; no module that consumes provider output imports the status-mutation module. Enforced by directory boundary (`src/verify/` never imports `src/llm/`).
2. **Models never inspect the repo.** No tool-calling code paths exist in v1. Evidence packets only.
3. **Extractors and checkers are plugins** against a stable interface, each in its own file; `src/registry.ts` is the single registration point and a serialization point.
4. **JSON schemas are the published contract**; TS types are derived/checked against them (ajv validates fixtures against schemas in CI). The schema files are what external consumers (GitHub App, MCP server) will depend on.
5. **Report and manifest output is deterministic:** stable key ordering, stable array sorting, no timestamps inside hashed content (timestamps live in envelope fields).
6. **Prompt-template quality work is NOT parcelized.** The harness (template versioning, packet assembly, output validation) is parcel work; making the 7B smart is coordinator/spike work in W2–W3.
7. **v1 ships with `openai-compatible` only.** Anthropic-native adapter is v1.1; do not scaffold speculative adapters.

## 7. What "Ready" Looks Like

A stranger clones a messy repo, runs `npx docspine audit`, and gets the report that sells the product: broken-claim counts, contradiction candidates, undocumented surfaces — in JSON and a readable summary. Our own repo passes its own audit. The tier model is verifiable in the code structure, not just the docs. UAT is the coordinator pointing it at real repos with genuine doc debt and not being embarrassed by the output.

## 8. Calendar Risks (coordination gates only)

- **Repo home decision: CLEARED** (personal/separate entity, 2026-07-09). Remaining pre-dispatch step is mechanical: create repo + bare-init README commit on `main`.
- W2 dogfood-on-real-repo exit criterion needs a repo with actual doc debt available — trivially satisfied, noted for completeness.
- No external stakeholder gates in v1. The first external gate is the wedge demo, which is post-v1.

*Parcels complete when they complete. Waves complete when exit criteria are met. This is the way.*
