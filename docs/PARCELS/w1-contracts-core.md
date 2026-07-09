# Parcel: w1-contracts-core

## Goal
Establish every contract the parallel W1/W2 work builds against — TS types, published JSON schemas, fixtures, contract-satisfaction tests — plus the repo toolchain skeleton and `AGENTS.md`.

## Wave
W1

## Branch
feat/w1-contracts-core

## Worktree
C:\Repos\docspine.w1-contracts-core

## Dependencies
- None (Batch 0; forks off freshly initialized `main`)

## Allowed Files
- package.json, package-lock.json, tsconfig.json, biome.json, .gitignore, .editorconfig
- AGENTS.md
- src/contracts/frontmatter.ts
- src/contracts/manifest.ts
- src/contracts/report.ts
- src/contracts/claims.ts
- src/contracts/plugins.ts
- src/contracts/provider.ts
- src/contracts/errors.ts
- src/contracts/index.ts
- schemas/frontmatter.schema.json
- schemas/manifest.schema.json
- schemas/report.schema.json
- schemas/evidence-packet.schema.json
- schemas/task-result.schema.json
- tests/contracts/fixtures.ts
- tests/contracts/schema-satisfaction.test.ts
- tests/contracts/tier-invariant.test.ts

## Forbidden
- NO implementations. No extractors, checkers, pipeline, git helpers, provider adapters, or CLI. Types, schemas, fixtures, and tests ONLY.
- Do not create `src/registry.ts` (the spike owns it).
- Do not create `fixtures/messy-repo/**` (w1-fixture-repo owns it).
- Do not add dependencies beyond the locked set: commander, gray-matter, picomatch, ajv (+ dev: typescript, tsx, @biomejs/biome, @types/node). Any other dep = stop and request a spec amendment.
- Do not add runtime validation libraries (zod, io-ts). Ajv against published schemas is the validation strategy.

## Out of Scope
Working verification of anything. Reviewers should expect zero behavior — only shapes, fixtures proving the shapes are satisfiable, and tests proving fixtures match schemas. Report/manifest determinism logic (stable ordering, hashing) is w1-report-writer / w2-manifest-compile.

## Existing Patterns To Follow
- docs/STRATEGY-docspine.md §2 (locked toolchain: ESM, Node ≥22, npx tsx --test, biome)
- Design spec §5 (frontmatter + manifest schemas), §8 (report), §19.1 (provider interfaces) — transcribe faithfully; where the spec is prose, the JSDoc you write becomes the canonical interpretation
- Test layout convention: flat tests/ dir, node:test runner, no test framework dependencies

## Contract
Author these as the deliverable (abbreviated here; full field lists per design spec sections cited):

```ts
// claims.ts
export type ClaimKind = 'path' | 'symbol' | 'command' | 'link';
/**
 * CANONICAL — value semantics for kind:"path": value MUST be normalized by the
 * extractor to a repo-root-relative POSIX path with no leading "./"; relative
 * Markdown links are resolved against ParsedDoc.path; raw preserves the
 * original matched text. Checkers never re-normalize.
 */
export interface Claim { kind: ClaimKind; value: string; docId: string; line: number; raw: string; }
// FindingStatus is a CLOSED union. Sub-reasons (e.g. unverifiable_symbol_language)
// live in ClaimFinding.detail, NEVER as new statuses.
export type FindingStatus = 'ok' | 'broken' | 'moved' | 'unverifiable';
export interface ClaimFinding { claim: Claim; status: FindingStatus; detail?: string; movedTo?: string; }

// plugins.ts
export interface ParsedDoc { id: string; path: string; frontmatter: DocFrontmatter | null; frontmatterErrors: string[]; body: string; }
// GitFacts is a DATA SHAPE only — no methods, no lazy helpers, no behavior
// pretending to be a contract. Populated once by the pipeline.
export interface GitFacts { isRepo: boolean; headSha: string | null; repoRoot: string | null; }
export interface RepoContext { root: string; symbolIndex?: SymbolIndex; git: GitFacts; }
export interface Extractor { id: string; kind: ClaimKind; extract(doc: ParsedDoc): Claim[]; }
export interface Checker { id: string; kind: ClaimKind; check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]>; }
export interface SymbolIndex { has(symbol: string): boolean; lookup(symbol: string): SymbolInfo[]; language: string; }

// frontmatter.ts — design spec §5.1, all fields, enums closed
// manifest.ts   — design spec §5.2, incl. routes, context_packets, trust_rules_digest
// report.ts     — design spec §8 output + envelope { generatedAtSha, toolVersion, analysisDepth }
// provider.ts   — design spec §19.1: LlmProvider, TaskRequest, TaskResult (advisory: true LITERAL type), EvidencePacket, CapabilitySet
// errors.ts     — closed union: rate_limited | context_exceeded | schema_unrecoverable | network_denied | provider_down
```

JSDoc rule: every field where two reasonable agents could disagree gets one canonical sentence. `covers` globs (picomatch semantics, repo-root-relative), `line` (1-indexed), `docId` (frontmatter id, else relative path), and `Claim.value` path normalization (the canonical sentence above, verbatim) are known ambiguity hotspots — document all four.

## Required Tests
- tests/contracts/schema-satisfaction.test.ts — every fixture object validates against its published JSON schema via ajv; a deliberately broken fixture fails.
- tests/contracts/tier-invariant.test.ts — asserts `TaskResult['advisory']` is the literal type `true` (compile-time via satisfies + runtime assert on fixture). The tier model gets a test from day one.

## Acceptance Criteria
- `npx tsc --noEmit` clean; `npx biome check .` clean; `npx tsx --test tests/` green.
- Every exported contract type has a corresponding fixture object.
- schemas/*.json are valid JSON Schema draft 2020-12 and ajv-compilable.
- AGENTS.md exists with load order + trust rules digest per design spec §7.

## Verification
- `npm ci && npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; see STRATEGY §2 amendment)
- Success: all green, zero skipped.

## Collision Risk
High by nature (everything downstream depends on it) but zero concurrent collision — it merges before anything else forks. After merge, `src/contracts/**` and `schemas/**` are frozen; changes go through the Contract Amendment process.

## PR Notes
- What changed: contracts, schemas, fixtures, toolchain skeleton, AGENTS.md
- Why: PDD Phase 1 — nothing parallel forks until this merges (docs/STRATEGY-docspine.md §5 W1)
- Risk: ambiguity in any field here multiplies across every downstream parcel; JSDoc completeness is the review focus
- Verification: run the three commands above; spot-check JSDoc on covers/line/docId

## Stop-and-Report Rule
If any design-spec contract is ambiguous in a way JSDoc cannot resolve with one canonical sentence, stop and report the decision needed. If a required file is not in Allowed Files, stop and request a spec amendment. Do not resolve ambiguity by inventing fields.
