# Parcel: w2-pipeline-audit

## Goal
Extend the spike's `run-verify` into the full **T0 audit pipeline**: inventory, all four claim kinds, staleness scoring, and coverage-gap analysis — emitting a complete schema-valid `AuditReport`.

## Wave
W2

## Branch
feat/w2-pipeline-audit

## Worktree
C:\Repos\docspine.w2-pipeline-audit

## Dependencies
- W1 complete (merged) — all extractors/checkers registered in `src/registry.ts`
- ca-010 prerequisite — optional `AuditReport.documentDiagnostics` in the report contract/schema and canonicalization
- None in W2 Batch A — accepts narrow typed options (no config file reads; `w2-cli-wiring` maps `DocSpineConfig` → options)

## Allowed Files
- src/pipeline/run-audit.ts
- src/pipeline/inventory.ts
- src/pipeline/score.ts
- src/pipeline/coverage.ts
- src/pipeline/run-verify.ts (extend only — do not rewrite the spike's proven path)
- scripts/audit.ts (temporary entry until w2-cli-wiring; mirrors scripts/spike-verify.ts)
- tests/pipeline/run-audit.test.ts
- tests/pipeline/inventory.test.ts
- tests/pipeline/score.test.ts
- tests/pipeline/coverage.test.ts

## Forbidden
- **Do NOT import from `src/llm/**` or add any provider/model code.** This parcel is pure T0. Design spec §8 steps 5 (duplication/contradiction) and 6 (classification) are T1 and belong to other parcels — leave `contradictions: []` and omit `provisionalKind`/`provisionalStatus`, do not stub fake values.
- Do NOT modify `src/contracts/**` or `schemas/**`. `AuditReport` already exists; satisfy it.
- Do NOT modify `src/registry.ts` — consume it as data.
- Do NOT modify any extractor or checker. If one is wrong, STOP and report; do not patch around it from the pipeline.
- No CLI framework (commander is `w2-cli-wiring`).
- No new dependencies.

## Out of Scope
Contradiction detection, LLM classification, drift (that is `w2-drift-engine`), manifest emission (`w2-manifest-compile`). Reviewers should expect one command's worth of deterministic analysis, not the product.

## Existing Patterns To Follow
- `src/pipeline/run-verify.ts` — the spike's walk → parse → extract → check → report flow; extend it rather than forking a parallel pipeline
- **ca-004 (line numbering):** extractors return `Claim.line` relative to `doc.body`; the pipeline adds the frontmatter offset before a claim leaves the pipeline. This parcel owns that offset application for the audit path too — do not re-derive it, reuse the spike's helper.
- `src/report/canonicalize.ts` + `src/report/hash.ts` — all report output goes through these. Stable key ordering, stable array sorting, timestamps in envelope fields only.
- `fixtures/messy-repo/EXPECTED-FINDINGS.md` — the oracle
- `npm run verify` is the gate

## Contract
```ts
export interface AuditOptions {
  ignore?: string[];
  sourceRoots?: string[];
}
runAudit(repoRoot: string, opts?: AuditOptions): Promise<AuditReport>
```
Locked decisions:
1. **`DocScore` semantics** (all three fields already typed in `src/contracts/report.ts`):
   - `brokenClaimRatio` = `(broken + moved) / totalClaims`; `unverifiable` is EXCLUDED from both numerator and denominator (we cannot fault a doc for a claim we lack the ability to check — counting it would let a missing Python indexer masquerade as doc rot). `0` when `totalClaims === 0`.
   - `coveredCodeChurn` = commit count touching any `covers` glob since the doc's last git-touch commit. `0` when the doc has no `covers` or the repo is not a git repo.
   - `docAgeVsCodeAge` = ratio of (days since doc last-touch) to (days since newest covered-path commit); `0` when undeterminable. Never `Infinity`/`NaN` — clamp and document.
2. **Coverage gap targets** — enumerate deterministically, no heuristic guessing: top-level directories of `src/` (and any configured source roots), `bin` entries in `package.json`, `.github/workflows/*`, migration directories, and test roots. A target with zero `covers` glob intersection across all docs is a `CoverageGap`.
3. **`fanIn`** = count of repo files importing/referencing the target (static text match on import specifiers is sufficient for v1; do not build a real dep graph). `churn` = commits touching the target.
4. **`analysisDepth`** must be set honestly — `"t0-only"` for this parcel. It exists so a quiet report can never be mistaken for a clean one.
5. Inventory honors `opts.ignore` globs via `picomatch` and respects `.gitignore` via `git ls-files` when the repo is a git repo (same rule the spike's walk already uses).
6. **Unreadable or malformed docs never abort the run.** `runAudit` emits `documentDiagnostics` with the repo-relative POSIX `path`, stable `code` (`unreadable_document` or `invalid_frontmatter`), and an actionable, deterministic `message`. These are NOT claim findings: never fabricate a `Claim`, `docId`, line, or score to represent a document failure, and never include diagnostics in `brokenClaimRatio` or other scores. Keep the existing `runVerify` tracked-but-unreadable skip behavior (no `DocFinding`) and its regression test (`tests/pipeline/run-verify-unreadable-doc.test.ts`) unchanged. Malformed but readable docs may still yield genuine extracted claims under the existing parser fallback; report validation failures separately. Omit diagnostics when absent or emit `[]`; canonicalization preserves absence and sorts present entries by `(path, code, message)`.

## Required Tests
- Full audit against a temp fixture copy: every `EXPECTED-FINDINGS.md` row reproduced across all four claim kinds, with expected statuses
- **Zero findings on both control negatives** (defects #10, #13) — precision, not just recall
- Coverage gap detects the fixture's undocumented subsystem (defect #9) and does NOT flag documented ones
- `brokenClaimRatio` excludes `unverifiable`: a doc whose only defect is the Python symbol claim (#12) scores `0`, not a penalty
- Tracked-but-missing document and malformed frontmatter produce the corresponding actionable document diagnostics in `runAudit`, with no invented claims or diagnostic-derived scores; existing `runVerify` skip regression remains green
- Emitted report validates against `schemas/report.schema.json` via ajv
- Byte-stability: two runs at the same SHA produce identical report bytes
- `contradictions` is `[]` and no `provisionalKind` is invented

## Acceptance Criteria
- `npm run verify` green
- `npx tsx scripts/audit.ts <fixture>` prints a summary and writes a schema-valid report
- `analysisDepth: "t0-only"`
- No import of `src/llm/**` anywhere (grep it in the PR)

## Verification
- `npm run verify`
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-audit`
- `npx tsx scripts/audit.ts $env:TEMP\ds-audit` twice → byte-identical reports

## Collision Risk
Medium — extends `src/pipeline/**`, which `w2-drift-engine` and `w2-manifest-compile` also read from but do not write. Keep changes additive; `run-verify.ts` edits should be minimal and behavior-preserving (the spike's path has passing tests that must stay green).

## PR Notes
- What changed: full T0 audit pipeline — inventory, scoring, coverage gaps
- Why: the audit report is the sellable wedge (design spec §17); this is the thing that produces it
- Risk: scoring semantics are product decisions; if the locked definitions above were reinterpreted, say so explicitly in the PR
- Verification: commands above, plus confirm control negatives stay clean

## Stop-and-Report Rule
If satisfying `AuditReport` requires a contract change, STOP and request a Contract Amendment. If an extractor or checker produces wrong output, STOP and report it as a defect — do not compensate in the pipeline. If a scoring definition above is ambiguous against real fixture data, stop and report.
