# Parcel: w1-frontmatter-validate

## Goal
Build the full frontmatter validator (ajv against the published schema, actionable error messages) and the machine-owned-field diffing primitive, as standalone reusable modules — not wired into the pipeline yet.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-frontmatter-validate

## Worktree
C:\Repos\docspine.w1-frontmatter-validate

## Dependencies
- w1-contracts-core (merged) — `src/contracts/frontmatter.ts`, `schemas/frontmatter.schema.json`

## Allowed Files
- src/frontmatter/validate.ts
- src/frontmatter/machine-fields.ts
- tests/frontmatter/validate.test.ts
- tests/frontmatter/machine-fields.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/pipeline/parse-doc.ts` — it currently does a deliberately MINIMAL frontmatter parse (presence/absence only, per `w1-spike-verify-paths`'s scope) and is a serialization point (`docs/PARCELS/index.md` Collision-Risk Files: `src/pipeline/**` is sequenced across waves). **Splicing this parcel's validator into the pipeline is a separate future wiring parcel's job, not yours.** Ship the validator as a standalone, independently-tested module.
- Do NOT implement actual git-diff-based "was this hand-edited" detection — that requires comparing committed content across commits plus a verify-report marker (design spec §5.1), which needs `w1-git-plumbing`'s helpers and a verify-report format that doesn't exist yet. This parcel ships the pure **comparison primitive** only (`diffMachineOwnedFields`, see Contract) — not the enforcement policy around it.
- No runtime validation library other than `ajv` (already a locked dependency) — do not add zod/io-ts/etc.

## Out of Scope
Wiring this validator into `docaudit compile` or any CLI — no CLI exists yet (`w2-cli-wiring`). Determining whether a specific git commit was "human" vs "tooling" — that's a policy decision for a future parcel with git-plumbing + CI context, not decidable from frontmatter objects alone.

## Existing Patterns To Follow
- `src/pipeline/parse-doc.ts` (merged, read-only reference) — shows the MINIMAL version of frontmatter parsing this parcel supersedes in capability (not in place — see Forbidden). Note its `frontmatterErrors: string[]` field on `ParsedDoc` and the "validity, not mere YAML-parseability, gates a non-null `frontmatter`" rule documented there — your validator is what a future wiring parcel will use to produce exactly that behavior for real.
- `tests/contracts/schema-satisfaction.test.ts` (merged, read-only reference) — shows the ajv-against-`schemas/frontmatter.schema.json` pattern already proven to work in this repo; reuse the same `Ajv2020` setup convention.
- `fixtures/messy-repo/docs/canon/malformed-frontmatter.md` and `fixtures/messy-repo/docs/canon/valid-frontmatter.md` — defect #11 (bad `kind` enum value `"cannon"`, missing required `owner`) and defect #10 (control negative) respectively. Use these as real-world validator test inputs, not just synthetic ones.

## Contract

```ts
// src/frontmatter/validate.ts
export interface FrontmatterValidationResult {
  /** Parsed YAML frontmatter data, present whenever a frontmatter block existed and parsed as YAML — regardless of whether it then passed schema validation. `null` only when no frontmatter block was found, or the block failed to parse as YAML at all. */
  data: Record<string, unknown> | null;
  /** Schema-valid `DocFrontmatter`, present if and only if `errors` is empty. */
  frontmatter: DocFrontmatter | null;
  /** Human-readable, actionable messages (e.g. `"kind: must be one of canon, adr, runbook, map, reference, history, scratch, guide (got \"cannon\")"`, `"owner: is required"`). Empty iff `frontmatter` is non-null. */
  errors: string[];
}

/**
 * Parses and schema-validates one doc's raw source text's frontmatter block
 * against `schemas/frontmatter.schema.json` (including the conditional
 * `covers`-required-for-canon/runbook rule, since that's expressed in the
 * schema itself via if/then — see w1-contracts-core's schema).
 */
export function validateFrontmatter(rawDocText: string, docPath: string): FrontmatterValidationResult;
```

```ts
// src/frontmatter/machine-fields.ts
/** The frontmatter fields tooling owns exclusively (design spec §5.1, P4). Never hand-edited. */
export const MACHINE_OWNED_FIELDS: readonly (keyof DocFrontmatter)[];

/**
 * Pure comparison: returns the subset of `MACHINE_OWNED_FIELDS` whose value
 * differs between `before` and `after`. Does NOT determine whether a change
 * was made by a human or by tooling — that requires git-commit-authorship
 * context and a verify-report marker this parcel does not have access to
 * (see Forbidden). This is the diffing primitive a future parcel composes
 * into the actual enforcement check.
 */
export function diffMachineOwnedFields(
  before: DocFrontmatter | null,
  after: DocFrontmatter,
): (keyof DocFrontmatter)[];
```

Use ajv's `allErrors: true` (matching `tests/contracts/schema-satisfaction.test.ts`'s convention) and format each ajv error into one readable string per the shape above — field path (dot-notation, e.g. `covers` or top-level), the rule that failed in plain English, and the offending value where useful. Do not just stringify raw ajv error objects.

## Required Tests
- `tests/frontmatter/validate.test.ts` — a fully valid frontmatter block (real doc: `valid-frontmatter.md`) → `errors: []`, `frontmatter` populated; the malformed fixture (`malformed-frontmatter.md`) → exactly the two errors named in `EXPECTED-FINDINGS.md` defect #11 (bad `kind` enum, missing `owner`), each as a readable message; a doc with `kind: canon` and no `covers` field → schema-conditional-rule error; a doc with no frontmatter block at all → `data: null`, `frontmatter: null`, a clear "no frontmatter block found" error; a doc whose frontmatter block is present but fails to parse as YAML (malformed YAML syntax, not just wrong values) → `data: null`, `frontmatter: null`, a YAML-parse-failure error.
- `tests/frontmatter/machine-fields.test.ts` — two `DocFrontmatter` fixtures differing only in `last_verified_sha` → that field name returned; identical fixtures → empty array; a `before: null` (first-ever verify) → treated as "everything present in `after` counts as set," per whatever sane convention you document (this is a genuine judgment call — pick one, document it, and don't guess silently if unsure: flag it in the PR).

## Acceptance Criteria
- Defect #11's two frontmatter errors reproduce exactly (in substance, not necessarily verbatim wording) against `docs/PARCELS/w1-fixture-repo.md`'s `EXPECTED-FINDINGS.md` detail substrings (`frontmatter_invalid:bad_enum_kind`, `frontmatter_invalid:missing_required_field_owner`) — your error messages don't need to literally contain those substrings (that mapping is a future wiring parcel's job turning validator output into `ClaimFinding`-shaped analysis findings), but the underlying two problems must both be independently detected and reported.
- Defect #10's doc validates clean.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. New files under `src/frontmatter/`, touched by no other in-flight parcel.

## PR Notes
- What changed: frontmatter validator + machine-field diff primitive + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1; design spec §5.1, P4
- Risk: error-message quality directly affects how useful `docaudit`'s output is to a human fixing a doc — review message wording for actionability, not just correctness.
- Verification: run the command above; read the malformed-fixture test's actual error strings and confirm a human could fix the doc from them alone

## Stop-and-Report Rule
If the `DocFrontmatter`/schema contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If the `before: null` convention for `diffMachineOwnedFields` isn't obviously correct, document your choice and flag it rather than silently picking one and moving on.