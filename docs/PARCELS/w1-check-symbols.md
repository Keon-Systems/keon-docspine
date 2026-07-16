# Parcel: w1-check-symbols

## Goal
Implement the `Checker` for `kind:"symbol"` claims. Consults the `SymbolIndex`
built by `w1-symbol-index-ts` (via `ctx.symbolIndex`) to classify each
backtick-extracted symbol claim as `ok`, `broken`, or `unverifiable`.

## Wave
W1 (Batch 3 — dispatched after w1-symbol-index-ts merged, so the real index
shape is visible before writing this spec)

## Branch
feat/w1-check-symbols

## Worktree
C:\Repos\docspine.w1-check-symbols

## Dependencies
- w1-contracts-core (merged) — `Checker`, `Claim`, `ClaimFinding`, `RepoContext`, `SymbolIndex`
- w1-extract-symbols (merged) — produces the `kind:"symbol"` claims this checker consumes
- w1-symbol-index-ts (merged) — `buildTypeScriptSymbolIndex` (imported in tests only)

## Allowed Files
- src/checkers/symbols.ts
- tests/checkers/symbols.test.ts

## Forbidden
- Do NOT modify `src/contracts/**` or `schemas/**`.
- Do NOT modify `src/pipeline/**`, `src/registry.ts`, or `src/extractors/**`.
- Do NOT call `buildTypeScriptSymbolIndex` from inside the checker itself —
  the checker reads `ctx.symbolIndex` only. Tests may import it to populate
  a `RepoContext` for the test harness.

## Contract

```ts
export const symbolChecker: Checker;
// id: "check-symbols"
// kind: "symbol"
```

Decision logic per claim (in order):

1. `ctx.symbolIndex` absent → `status: "unverifiable"`,
   `detail` contains `"unverifiable_no_index"`
2. `ctx.symbolIndex.has(claim.value)` true → `status: "ok"`,
   `detail`: `"symbol_exists:{name}"`
3. Symbol not found in TS/JS index, but a word-boundary text scan of
   non-TS/JS source files finds the name → `status: "unverifiable"`,
   `detail`: `"unverifiable_symbol_language"`
4. Symbol not found anywhere → `status: "broken"`,
   `detail`: `"symbol_not_found:{name}"`

## Non-TS/JS scan (case 3)

When a symbol is missing from the TS/JS index, the checker does a single
plain-text scan over all non-TS/JS source files (`.py`, `.rb`, `.go`, any
extension not in `{.ts, .tsx, .js, .jsx}`):

- File enumeration: `git ls-files` when `ctx.git.isRepo` is true, else
  a recursive filesystem walk skipping `.git` and `node_modules` — same
  discipline as `src/symbol-index/typescript.ts`'s enumerator.
- Match: word-boundary regex `(?<![A-Za-z0-9_$])<sym>(?![A-Za-z0-9_$])`
  applied to each file's text content. No language parsing — purely textual.
- Efficiency: one pass over all non-TS/JS files covers all missing symbols
  at once. Short-circuit when every missing symbol has been found.

This detects fixture defect #12 (`format_report` in `src-py/report_utils.py`)
without false-positiving on TS/JS files already covered by the index.

## Required Tests
- Symbol found in TS index → `ok` with `detail: "symbol_exists:computeInvoiceTotal"`
  (fixture defect #13 shape)
- Symbol not in TS index, found in Python file → `unverifiable`,
  `detail` contains `"unverifiable_symbol_language"` (fixture defect #12: `format_report`)
- Symbol not found anywhere → `broken`, `detail: "symbol_not_found:getInvoicePdf"`
  (fixture defect #3 shape)
- No `symbolIndex` in ctx → all claims `unverifiable`, detail contains
  `"unverifiable_no_index"`
- Batch with all three result types in one call → each resolves correctly
  (proves single-pass scan works across a mixed batch)

## Acceptance Criteria
- Fixture defect #12 (`format_report`) resolves `unverifiable` / `unverifiable_symbol_language`.
- Fixture defect #3 (`getInvoicePdf`) resolves `broken` / `symbol_not_found:getInvoicePdf`.
- Fixture defect #13 (`computeInvoiceTotal`) resolves `ok`.
- No crash on any file in `fixtures/messy-repo`.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test`
- Success: all green.

## Collision Risk
Low. New file (`src/checkers/symbols.ts`), touched by no other in-flight parcel.
`ctx.symbolIndex` is an existing optional field in `RepoContext` (contracts) —
no contract change needed.

## PR Notes
- What changed: symbol claim checker + tests
- Why: design spec §8 Step 3 (checker layer), STRATEGY §2 (TS-only v1 index);
  closes the `w1-check-symbols` W1 parcel
- Risk: the non-TS/JS scan is textual, not parsed — a symbol name that appears
  as a substring inside a longer identifier or string literal could produce a
  false `unverifiable`. Word-boundary regex mitigates the substring case; the
  string-literal case is an accepted v1 imprecision (flagging as unverifiable
  is safe — it's better than calling something broken when the user's doc is
  correct).

## Stop-and-Report Rule
If `RepoContext.symbolIndex`'s shape differs from what this spec expects, stop
and request a spec amendment. If the non-TS/JS scan produces unexpected results
on the fixture, document in the PR rather than silently adjusting the test oracle.
