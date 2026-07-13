# Parcel: w1-check-links

## Goal
Implement the `link`-kind `Checker`: resolve self-anchor and cross-doc anchor references against a target markdown file's actual headings.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-check-links

## Worktree
C:\Repos\docspine.w1-check-links

## Dependencies
- w1-contracts-core (merged)
- w1-spike-verify-paths (merged) — read as a worked example
- No hard dependency on `w1-extract-links` merging first — this parcel's tests construct synthetic `Claim` objects directly, using the `<path>#<anchor>` value convention documented in that parcel's spec. Parallel-safe.

## Allowed Files
- src/checkers/links.ts
- tests/checkers/links.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/checkers/paths.ts`, `src/registry.ts`, or anything under `src/pipeline/**` — frozen/serialized. Registering this checker is `w1-registry-wiring`'s job.
- Do NOT modify `fixtures/messy-repo/**` — read-only.
- No network access (external URL liveness is out of scope in v1, per design spec §21 — see `w1-extract-links`, which never even extracts a `link` claim for an external URL, so this checker never sees one).

## Out of Scope
Whether the *path* half of a cross-doc link exists as a file at all in the git-history sense (moved/renamed) — that nuance belongs to `paths.ts`'s parallel claim on the same link (see `w1-extract-links`'s spec for why a cross-doc anchor link produces two independent claims from two extractors). This checker only needs to know: does the target file exist on disk right now, and if so, does it contain a heading that slugifies to the claimed anchor.

## Existing Patterns To Follow
- `src/checkers/paths.ts` (merged) — same `Checker` shape, same "never crash" discipline.
- `docs/PARCELS/w1-extract-links.md` — the sibling extractor parcel's spec, which defines the `Claim.value` convention this checker consumes: **`<repo-relative-target-path>#<anchor-as-written>`** (self-anchor links use the source doc's own path as the path half). Read it for the exact shape and the two fixture examples before writing anything.
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — defect #5 (`docs/canon/payments.md`, self-anchor `#rollback-procedure`, expected `broken`, detail substring `anchor_not_found:rollback-procedure` — the doc's actual heading is `## Rollback`, which slugifies to `rollback`), defect #13 (`docs/canon/all-claim-kinds-valid.md`, self-anchor `#overview`, expected `ok`, detail substring `anchor_exists:overview` — the doc's heading is `## Overview`, which slugifies to `overview`).

## Contract

```ts
export const linkChecker: Checker = {
  id: "check-links",
  kind: "link",
  async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> { ... }
};
```

**Checking rule, per claim:**
1. Split `claim.value` on the **last** `#` into `targetPath` and `anchor` (a path can legitimately contain no `#` elsewhere, so splitting on the last occurrence is the safe rule — document this choice inline).
2. Resolve `targetPath` against `ctx.root` and check existence (`existsSync`, same convention as `src/checkers/paths.ts`). Missing → `status: "broken"`, `detail: "link_target_missing"`.
3. If present, read the target file's raw text and extract ATX headings (lines starting with `1`–`6` `#` characters followed by a space — the standard `# `..`###### ` forms; ignore setext-style `===`/`---` headings, out of scope for v1). Slugify each heading using a **GitHub-flavored-markdown-compatible** algorithm: lowercase, strip characters that aren't letters/digits/spaces/hyphens, collapse whitespace runs to single hyphens, trim leading/trailing hyphens. (This must match how a human reading the doc on GitHub would expect `## Rollback` to become `#rollback` — write a small pure `slugify()` helper and unit-test it directly against the fixture headings.)
4. If the claimed `anchor` (itself lowercased before comparison — the anchor as extracted may preserve original case, but GFM anchors are case-insensitive) matches any heading's slug → `status: "ok"`, `detail: "anchor_exists:<anchor>"`. Otherwise → `status: "broken"`, `detail: "anchor_not_found:<anchor>"`.
5. Never crash on a target file that fails to read (permissions, binary content, etc.) — treat as `status: "unverifiable"`, `detail: "unverifiable_link_target_unreadable"`.

## Required Tests
- `tests/checkers/links.test.ts` — a `slugify()` unit test against real fixture headings (`## Rollback` → `rollback`, `## Overview` → `overview`, and at least one heading with punctuation/mixed case to prove the algorithm generalizes, e.g. `## Foo & Bar!` → `foo-bar`); a self-anchor claim whose anchor doesn't match any heading (defect #5's shape) → `broken` with the right detail; a self-anchor claim whose anchor does match (defect #13's shape) → `ok` with the right detail; a claim pointing at a nonexistent target file → `broken` with `link_target_missing`; a claim pointing at an existing file with no matching heading → `broken` with `anchor_not_found`.

## Acceptance Criteria
- Defects #5 and #13's link-kind claims (constructed as synthetic `Claim` fixtures per the `w1-extract-links` convention, against the real fixture doc files on disk) resolve to the exact status/detail pairs in `EXPECTED-FINDINGS.md`.
- `slugify()` matches GitHub's anchor-generation behavior closely enough for every heading actually present in `fixtures/messy-repo/docs/**`.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. Sole file (`src/checkers/links.ts`). Does not touch `src/registry.ts`.

## PR Notes
- What changed: link checker + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1; design spec §8 Step 3
- Risk: slugify-algorithm fidelity — a subtly wrong slugify implementation produces false `broken` findings on perfectly valid anchors. Review the `slugify()` test cases hardest, against the actual fixture doc headings, not just synthetic examples.
- Verification: run the command above; manually cross-check `slugify()` output for every heading in `fixtures/messy-repo/docs/canon/*.md` against what GitHub would render

## Stop-and-Report Rule
If the `Checker`/`ClaimFinding` contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If the `<path>#<anchor>` value convention from `w1-extract-links` turns out to be unworkable, flag it in the PR rather than inventing a different parsing convention unilaterally — the two parcels must agree.