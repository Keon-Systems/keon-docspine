# Parcel: w1-extract-symbols

## Goal
Implement the `symbol`-kind `Extractor`: pull backtick-fenced code-symbol identifiers out of a doc's prose body.

## Wave
W1 (Batch 2 — parallel, wide; forks after w1-spike-verify-paths merged)

## Branch
feat/w1-extract-symbols

## Worktree
C:\Repos\docspine.w1-extract-symbols

## Dependencies
- w1-contracts-core (merged)
- w1-spike-verify-paths (merged) — read as a worked example, not a dependency to wire against

## Allowed Files
- src/extractors/symbols.ts
- tests/extractors/symbols.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`. If the `Extractor`/`Claim` contract can't express what you need, STOP and request a Contract Amendment.
- Do NOT modify `src/extractors/paths.ts`, `src/registry.ts`, or anything under `src/pipeline/**` — those are frozen/serialized (see `docs/PARCELS/index.md` Collision-Risk Files). Registering this extractor in `src/registry.ts` is `w1-registry-wiring`'s job, not yours.
- Do NOT build a symbol checker or touch `SymbolIndex` — that's `w1-check-symbols` / `w1-symbol-index-ts`.
- No filesystem or network access from inside the extractor — pure function of `ParsedDoc`, per the `Extractor` contract.

## Out of Scope
Whether the symbol actually exists in source (that's the checker's job, `w1-check-symbols`). Multi-language symbol conventions beyond "looks like an identifier, possibly dotted, possibly with a trailing `()`" — language-specific validation happens at check time, not extraction time.

## Existing Patterns To Follow
- `src/extractors/paths.ts` (merged) — same file shape, same masking-then-scanning approach, same **line-numbering convention** (see Contract below — read this file first, it is the canonical worked example for everything in this parcel).
- `src/contracts/claims.ts` — `Claim`, `ClaimKind`, the `Claim.value` normalization JSDoc (symbols get NO path-style normalization: literal identifier as written, whitespace-trimmed).
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — defect #3 (`docs/canon/billing.md` → `` `getInvoicePdf()` `` → `symbol_not_found`), defect #12 (`docs/canon/metrics.md` → `` `format_report` ``), defect #13 (`docs/canon/all-claim-kinds-valid.md` → `` `computeInvoiceTotal` ``).

## Contract

```ts
export const symbolExtractor: Extractor = {
  id: "extract-symbols",
  kind: "symbol",
  extract(doc: ParsedDoc): Claim[] { ... }
};
```

**Extraction rule:** a backtick-fenced inline span (`` `...` ``) is a symbol claim when its contents look like a code identifier and NOT like a path (see below for the split with `w1-extract-symbols` vs `paths.ts`) — i.e. it does **not** contain `/`, and it matches an identifier-ish pattern: optional dotted segments (`SessionService.SetAsync`), optional trailing `()` (stripped from the claim `value`; `getInvoicePdf()` → value `getInvoicePdf`), letters/digits/`_`/`$`. Reject spans that are pure punctuation, pure numbers, or shell-flag-looking tokens (`--foo`, `-x`) — those aren't symbols. Fenced code **blocks** (` ``` `) are masked out entirely before scanning, same as `paths.ts` — a symbol claim only comes from inline backtick spans in prose, never from inside a fenced block (that's `w1-extract-commands`'s territory).

**CANONICAL line-numbering convention (read this before writing anything):** `Claim.line` must be the full-source-file line number (post-frontmatter), but `Extractor.extract(doc: ParsedDoc)` only ever receives `doc.body` (frontmatter already stripped, per the `ParsedDoc` contract) with no offset info attached. The established convention (`docs/PARCELS/index.md` amendment ca-004, set by `w1-spike-verify-paths`, `src/pipeline/parse-doc.ts` / `src/pipeline/run-verify.ts`): **extractors compute `Claim.line` relative to `doc.body`'s own first line** (1-indexed, ignoring any stripped frontmatter) — the pipeline adds the frontmatter offset before a claim leaves the pipeline. You do not need to know or handle the offset; just number lines within `doc.body` as if it were the whole file, exactly like `src/extractors/paths.ts` does.

`Claim.raw` is the original matched text including backticks (e.g. `` `getInvoicePdf()` ``). `Claim.docId` is `doc.id`, per the same rule as every other extractor.

## Required Tests
- `tests/extractors/symbols.test.ts` — precision/recall cases: a plain identifier (`` `getInvoicePdf` ``), an identifier with trailing call parens (`` `getInvoicePdf()` `` → value `getInvoicePdf`), a dotted identifier (`` `SessionService.SetAsync` ``), rejection of a path-shaped span (`` `src/foo.ts` `` — must NOT be claimed as a symbol; that's `paths.ts`'s claim), rejection of a bare shell flag (`` `--prod` ``) and a pure number (`` `42` ``), a symbol inside a fenced code block (must be masked, zero claims), correct line numbers on a multi-line doc body.

## Acceptance Criteria
- Every `EXPECTED-FINDINGS.md` row with Claim Kind `symbol` and a claim naturally reachable from this extractor's fixture docs is reproducible once wired into a registry (you are not wiring the registry — `w1-registry-wiring` does — but your unit tests must prove your extractor alone produces the right `Claim` objects against those fixture docs' raw text).
- No path-shaped or command-shaped spans are misclassified as symbols.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test` (bare — no `tests/` path arg; requires Node ≥22 active, e.g. `nvm use 22`)
- Success: all green.

## Collision Risk
Low. Sole file (`src/extractors/symbols.ts`) not touched by any other in-flight Batch 2 parcel. Does not touch `src/registry.ts`.

## PR Notes
- What changed: symbol extractor + tests
- Why: `docs/STRATEGY-docspine.md` §4 item 1 (deterministic pipeline primitives); design spec §8 Step 2
- Risk: extraction precision — a too-loose identifier regex produces false-positive symbol claims from prose; a too-strict one misses real ones. Review the precision/recall test cases hardest.
- Verification: run the command above; spot-check the fixture docs (`billing.md`, `metrics.md`, `all-claim-kinds-valid.md`) by eye against the extractor's output

## Stop-and-Report Rule
If the `Claim`/`Extractor` contract can't express what's needed, stop and request a Contract Amendment — do not adapt around it. If a required file is not in Allowed Files, stop and request a spec amendment. If you hit an extraction-heuristic edge case the spec doesn't resolve (e.g. a symbol containing `$` or unicode), make the narrowest reasonable call, document it in the PR, and flag it — don't silently invent a broad rule.