# Parcel: w1-spike-verify-paths

## Goal
Prove the Extractor/Checker/report contracts end-to-end: a pipeline skeleton that walks the fixture repo, extracts and checks PATH claims only, and emits a schema-valid report.

## Wave
W1 (PDD Phase 2 — thin vertical spike; nothing in Batch 2 dispatches until this merges)

## Branch
feat/w1-spike-verify-paths

## Worktree
C:\Repos\docspine.w1-spike-verify-paths

## Dependencies
- w1-contracts-core (merged)
- w1-fixture-repo (merged)

## Allowed Files
- src/pipeline/walk.ts
- src/pipeline/run-verify.ts
- src/pipeline/parse-doc.ts
- src/extractors/paths.ts
- src/checkers/paths.ts
- src/registry.ts            (PROVISIONAL — created here, finalized by w1-registry-wiring)
- scripts/spike-verify.ts    (entry: npx tsx scripts/spike-verify.ts <repo-root>)
- tests/pipeline/spike-e2e.test.ts
- tests/extractors/paths.test.ts
- tests/checkers/paths.test.ts

## Forbidden
- Do NOT modify src/contracts/** or schemas/**. If a contract is wrong, STOP — that is this parcel's most valuable possible output. Request a Contract Amendment; do not adapt around the flaw.
- No CLI framework usage (commander is w2-cli-wiring). The entry script is a bare tsx script.
- No extractors/checkers beyond `path`. No symbol index, no command checks, no link checks, no frontmatter deep-validation (parse-doc.ts does minimal gray-matter parse: frontmatter present/absent + id fallback; full validation is w1-frontmatter-validate).
- No LLM/provider code of any kind. This is pure T0.
- Registry must be data-shaped (arrays of Extractor/Checker), not clever: no dynamic imports, no decorators, no auto-discovery.

## Out of Scope
Report determinism hardening (stable hashing — w1-report-writer), rename-detection edge cases beyond `git log --follow` happy path, performance. Reviewers should expect a working skeleton, not a polished tool.

## Existing Patterns To Follow
- src/contracts/plugins.ts — implement Extractor/Checker exactly as merged; the spike consumes contracts, it does not reinterpret them
- fixtures/messy-repo/EXPECTED-FINDINGS.md — the e2e test's oracle rows for kind=path
- docs/STRATEGY-docspine.md §6.5 — where determinism is cheap now (sort findings by docId, then line), do it; where it needs the report-writer, leave a TODO referencing w1-report-writer

## Contract
Pipeline shape (consumes, does not define):

```ts
runVerify(repoRoot: string, registry: Registry): Promise<AuditReport>
// walk: enumerate *.md under repoRoot (respect .gitignore via git ls-files when a git repo)
// parse-doc: ParsedDoc with minimal frontmatter
// extract: registry.extractors where kind supported
// check: registry.checkers keyed by claim kind
// report: contracts/report.ts shape, envelope populated, validated with ajv before write
```

Path checker behavior: exists → ok; missing but `git log --follow --diff-filter=R` locates a rename → moved (+movedTo); missing, no rename → broken; repo not a git repo → existence check only, rename detection reported as unverifiable-detail, never a crash.

## Required Tests
- tests/extractors/paths.test.ts — extraction precision/recall on inline doc samples (backtick paths, relative links, bare paths in prose per the extraction rules JSDoc'd in contracts)
- tests/checkers/paths.test.ts — ok / broken / moved / non-git-repo behaviors against a temp fixture copy with seeded git history (uses fixture setup script)
- tests/pipeline/spike-e2e.test.ts — full run against temp fixture copy; asserts every EXPECTED-FINDINGS row with kind=path is present with expected status, asserts ZERO path findings for control-negative docs (#10, #13), and validates the emitted report against schemas/report.schema.json via ajv

## Acceptance Criteria
- `npx tsx scripts/spike-verify.ts fixtures/messy-repo` (after fixture git setup) prints a summary and writes a schema-valid report JSON
- All EXPECTED-FINDINGS kind=path rows reproduced; no false positives on control negatives
- Contracts survived contact with reality — OR amendments were filed. Both are success; silent workarounds are failure.

## Verification
- `npx tsc --noEmit && npx biome check . && npx tsx --test tests/`
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\ds-spike && npx tsx scripts/spike-verify.ts $env:TEMP\ds-spike`
- Success: green tests; report validates; summary shows expected broken/moved counts

## Collision Risk
Medium — creates src/registry.ts and src/pipeline/**, both listed serialization points. Mitigated by sequencing: this parcel runs SOLO (Batch 1); nothing else is in flight.

## PR Notes
- What changed: pipeline skeleton, path extractor/checker, provisional registry, spike entry script
- Why: PDD Phase 2 — validate abstractions before nine parcels fork against them
- Risk: any contract friction discovered here and worked around instead of amended will surface as five broken parcels in Batch 2
- Verification: run the two command blocks above; review for silent contract reinterpretation

## Stop-and-Report Rule
If the Extractor/Checker/report contracts cannot express what the pipeline needs, STOP and request a Contract Amendment — that discovery is the spike's purpose. If a required file is not in Allowed Files, stop and request a spec amendment. If a product decision is missing (e.g., how to treat paths in code comments), stop and report.
