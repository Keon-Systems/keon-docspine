# Parcel: w1-extract-links

## Goal
Implement the `link`-kind `Extractor`: pull markdown-link anchor references (in-doc and cross-doc) out of a doc's prose body.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-extract-links

## Worktree
C:\Repos\docspine.w1-extract-links

## Dependencies
- w1-contracts-core (merged)
- w1-spike-verify-paths (merged) — read as a worked example, not a dependency to wire against

## Allowed Files
- src/extractors/links.ts
- tests/extractors/links.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/extractors/paths.ts`, `src/registry.ts`, or anything under `src/pipeline/**` — frozen/serialized. Registering this extractor is `w1-registry-wiring`'s job.
- Do NOT build a link checker — that's `w1-check-links`.
- No filesystem or network access — pure function of `ParsedDoc`.
- Do NOT extract plain (non-anchor) path-only markdown links as `link` claims — those are `paths.ts`'s job already (merged). Extracting them here too would double-claim the same target under two kinds for no reason; see Contract for the exact split.

## Out of Scope
Resolving whether the anchor actually exists in the target file (that's `w1-check-links`'s job — it reads the target file itself, see that parcel's spec). External (`http(s)://`) URL liveness — not checked anywhere in v1 (design spec §21: external URLs are `unverifiable_offline` in air-gapped mode; in v1 scope they are simply not extracted as link claims at all, since there's nothing this deterministic tier can check about them without network egress).

## Existing Patterns To Follow
- `src/extractors/paths.ts` (merged) — **read `resolveLinkTarget` in that file carefully.** It already splits a markdown link target on `#` and extracts the *path* portion as a `path`-kind claim when non-empty (ignoring the anchor). This parcel is the complementary half: the *anchor* portion of that same link syntax becomes a `link`-kind claim. A link like `[Rollback](payments.md#rollback-procedure)` legitimately produces **two claims from two different extractors**: a `path` claim for `payments.md` (from `paths.ts`) and a `link` claim for `payments.md#rollback-procedure` (from this parcel) — that is intentional, not a duplicate-detection bug.
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — defect #5 (`docs/canon/payments.md`, `[Rollback Procedure](#rollback-procedure)`, expected `broken`, detail substring `anchor_not_found:rollback-procedure` — the doc's own heading is `## Rollback`, which slugifies to `rollback`, not `rollback-procedure`), defect #13 control-negative (`docs/canon/all-claim-kinds-valid.md`, `[Overview](#overview)`, matching its own `## Overview` heading, expected `ok`).

## Contract

```ts
export const linkExtractor: Extractor = {
  id: "extract-links",
  kind: "link",
  extract(doc: ParsedDoc): Claim[] { ... }
};
```

**Extraction rule:** scan markdown links `[text](target)` (the same `MD_LINK_RE`-style pattern as `paths.ts` — matching syntax, different filter) whose `target` contains a `#` fragment. Two shapes:
1. **Self-anchor** — target is `#section` (nothing before the `#`). `Claim.value` is **`<doc.path>#<anchor>`** — the current doc's own repo-root-relative POSIX path (no leading `./`), joined to the anchor exactly as written (do not slugify or lowercase in the extractor — that normalization is the checker's job at check time, so the checker can apply one canonical slugify algorithm consistently to both sides of the comparison).
2. **Cross-doc anchor** — target is `otherfile.md#section` (or a relative path to one). `Claim.value` is **`<resolved-repo-relative-path>#<anchor>`**, where the path portion is resolved against `doc.path` using the exact same relative-resolution rule `paths.ts`'s `resolveLinkTarget` uses (resolve relative to the directory of `doc.path`, strip a leading `/`, no leading `./`).

Links with no `#` fragment at all produce **zero** claims here (pure `paths.ts` territory). Links whose target is an external URL (`scheme://...`) or `mailto:` produce zero claims (design spec §21 — external liveness isn't a T0 concern in v1). Bare anchor-looking text with no markdown link syntax (e.g. a prose mention of `#section` with no `[...](...)`) is NOT extracted — only real markdown link syntax counts.

`Claim.raw` is the original matched `[text](target)` text. `Claim.docId` is `doc.id`.

**CANONICAL line-numbering convention:** same as every other extractor (ca-004, `docs/PARCELS/index.md`) — `Claim.line` is 1-indexed relative to `doc.body`'s own first line; the pipeline adds the frontmatter offset later.

## Required Tests
- `tests/extractors/links.test.ts` — self-anchor link (`[x](#foo)` → value `<docPath>#foo`), cross-doc anchor link (`[x](other.md#foo)` → value resolved relative to the doc's directory, joined `#foo`), plain path-only link with no anchor (zero claims — confirms no double-extraction with `paths.ts`'s territory), external URL with a fragment (`https://example.com/x#foo` — zero claims), `mailto:` link (zero claims), correct line numbers across a multi-line doc body. Include the two fixture cases from `payments.md` and `all-claim-kinds-valid.md` verbatim as inline samples (mirroring their real doc text) so this parcel's own tests double as a preview of what `w1-check-links` must later resolve correctly.

## Acceptance Criteria
- Defect #5 and #13's link-kind fixture lines each produce exactly one `Claim` with the documented `value` shape.
- Plain path-only links (no `#`) never produce a `link`-kind claim.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active)
- Success: all green.

## Collision Risk
Low. Sole file (`src/extractors/links.ts`) not touched by any other in-flight Batch 2 parcel. Does not touch `src/registry.ts` or `src/extractors/paths.ts` (read-only reference).

## PR Notes
- What changed: link extractor + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1; design spec §8 Step 2
- Risk: the `<path>#<anchor>` `Claim.value` encoding is a convention this parcel establishes for `w1-check-links` to consume — if that shape is ambiguous or wrong, it's cheaper to catch here (both parcels are still in Batch 2) than after `w1-check-links` has already built against a wrong assumption. Flag any doubt rather than shipping a convention silently.
- Verification: run the command above; spot-check `payments.md` and `all-claim-kinds-valid.md` by eye against extractor output

## Stop-and-Report Rule
If the `Claim`/`Extractor` contract can't express what's needed, stop and request a Contract Amendment. If a required file is not in Allowed Files, stop and request a spec amendment. If the `<path>#<anchor>` value encoding turns out to be awkward for a checker to consume, flag it loudly in the PR rather than guessing at a better shape unilaterally — `w1-check-links` is being spec'd in parallel and needs to agree on this convention.