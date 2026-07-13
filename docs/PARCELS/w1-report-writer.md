# Parcel: w1-report-writer

## Goal
Formalize deterministic report assembly — canonical stable ordering across every array field, plus a content hash — as a standalone module the pipeline will later be wired to use.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-report-writer

## Worktree
C:\Repos\docspine.w1-report-writer

## Dependencies
- w1-contracts-core (merged) — `src/contracts/report.ts`

## Allowed Files
- src/report/canonicalize.ts
- src/report/hash.ts
- tests/report/canonicalize.test.ts
- tests/report/hash.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`. Do not invent new `AuditReport` fields (e.g. a timestamp field) even though `docs/STRATEGY-docspine.md` §6 anticipates "envelope timestamps" in general — the current merged `AuditReport` contract has no timestamp field at all (only `generatedAtSha`, `toolVersion`, `analysisDepth`, none of which are wall-clock timestamps), so there is nothing to exclude from the hash on that account. If you believe a timestamp field is genuinely needed, STOP and request a Contract Amendment — do not add one unilaterally.
- Do NOT modify `src/pipeline/run-verify.ts` — it already does ad hoc sorting (`docFindings` by `docId`, `claimFindings` by `line`) inline, which is intentionally "cheap to do now" scaffolding per that parcel's own TODO comments referencing this parcel. **Splicing this parcel's canonical assembly into the pipeline (replacing the inline sort) is a future wiring parcel's job, not yours.** Ship this as a standalone, independently-tested module that produces the same ordering guarantee in a reusable, more complete form (it also canonically orders `gaps` and `contradictions`, which the spike's inline sort never touched, since those arrays are always empty in the spike's path-only scope).
- Do NOT modify `src/registry.ts` or any extractor/checker.

## Out of Scope
Manifest determinism (`manifest.json` byte-stability) — that's `w2-manifest-compile`'s job on a different data shape; this parcel is `AuditReport` only. Signing or attesting the hash — that's a future enterprise-tier concern (design spec §22.3), not v1.

## Existing Patterns To Follow
- `src/pipeline/run-verify.ts` (merged, read-only reference) — its inline `docFindings.sort(...)` and `claimFindings.sort(...)` calls are exactly the narrower version of what this parcel generalizes. Match its sort-key choices where they overlap (docId lexicographic, line ascending) rather than inventing a different convention.
- `docs/STRATEGY-docspine.md` §6 item 5 — "stable key ordering, stable array sorting, no timestamps inside hashed content" is the design constraint this parcel exists to satisfy generally.

## Contract

```ts
// src/report/canonicalize.ts
/**
 * Returns a deep-cloned `AuditReport` with every array field in canonical,
 * deterministic order:
 *   - `docFindings`: sorted by `docId` (lexicographic).
 *   - each `docFindings[].claimFindings`: sorted by `(claim.line, claim.kind, claim.value)` ascending, in that tie-break order.
 *   - `gaps`: sorted by `target` (lexicographic).
 *   - `contradictions`: sorted by `docIds` (lexicographic on the joined pair, e.g. `docIds.join("")` — do NOT use a literal NUL byte as a join delimiter anywhere in this codebase; it breaks git's text/binary detection for any file containing the literal byte, confirmed the hard way in `w1-spike-verify-paths`'s review. Use `JSON.stringify` or a printable delimiter instead).
 * Idempotent: canonicalizing an already-canonical report returns an
 * equivalent structure.
 */
export function canonicalizeReport(report: AuditReport): AuditReport;
```

```ts
// src/report/hash.ts
/**
 * Canonicalizes `report` (via `canonicalizeReport`) and returns a stable
 * SHA-256 hex digest of its content: a deterministic JSON serialization
 * with object keys sorted recursively (so field-insertion-order differences
 * between two structurally-identical reports never change the hash).
 * `generatedAtSha`/`toolVersion`/`analysisDepth` ARE included in the hash —
 * there is no timestamp field to exclude in the current contract (see
 * Forbidden); the hash identifies "this exact report's content," which
 * legitimately changes when the SHA it ran against changes.
 */
export function hashReport(report: AuditReport): string;
```

## Required Tests
- `tests/report/canonicalize.test.ts` — two `AuditReport` fixtures with identical content but differently-ordered arrays (`docFindings` in reverse, `claimFindings` shuffled, `gaps`/`contradictions` shuffled) canonicalize to `deepEqual` results; a report with a single entry in each array is a no-op; calling `canonicalizeReport` twice produces the same result as calling it once (idempotence).
- `tests/report/hash.test.ts` — two differently-ordered-but-equivalent reports (per above) hash identically; two reports differing in exactly one `ClaimFinding.status` hash differently; two reports differing only in key-insertion-order (build the same object via two different property-assignment orders) hash identically.

## Acceptance Criteria
- `hashReport` is order-insensitive to every array field and key-insertion-order-insensitive, and sensitive to any actual content change.
- No literal NUL byte appears anywhere in this parcel's source (grep for it before opening the PR — see the Contract note above for why this is now a named house rule, not just a style preference).

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. New files under `src/report/`, touched by no other in-flight parcel.

## PR Notes
- What changed: canonical report assembly + content hashing + tests
- Why: `docs/STRATEGY-docspine.md` §6 item 5; design spec §8 "Output", §22.3 (hash feeds a future attestation trail)
- Risk: an ordering or hashing bug here silently defeats CI's future "manifest/report matches fresh compile" check (design spec §12) — review the sort-key tie-break order and the recursive key-sorting in `hashReport` carefully, they're the whole point of this parcel.
- Verification: run the command above; manually construct two differently-ordered equivalent reports and confirm identical hashes by hand, not just via the test suite

## Stop-and-Report Rule
If the `AuditReport` contract can't express what's needed (e.g. you conclude a timestamp field is genuinely required), stop and request a Contract Amendment — do not add fields unilaterally. If a required file is not in Allowed Files, stop and request a spec amendment.