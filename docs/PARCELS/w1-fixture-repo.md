# Parcel: w1-fixture-repo

## Goal
Create `fixtures/messy-repo/` — a small fake project with cataloged, intentional documentation defects — plus `EXPECTED-FINDINGS.md`, the machine-and-human-readable oracle every downstream test suite asserts against.

## Wave
W1

## Branch
feat/w1-fixture-repo

## Worktree
C:\Repos\docspine.w1-fixture-repo

## Dependencies
- None (Batch 0; parallel with w1-contracts-core)

## Allowed Files
- fixtures/messy-repo/** (all files under this root — this parcel owns the tree)
- fixtures/messy-repo/EXPECTED-FINDINGS.md
- fixtures/README.md

## Forbidden
- No source files outside fixtures/. No src/, no tests/, no schema changes.
- No dependencies added. The fixture repo's own package.json is inert fixture data, never installed.
- Do not make the fixture "realistic-big." Target ≤ 30 files total. Every file must exist to trigger or control-negative a specific finding.
- No real company names, real ticket content, or anything resembling production data in fixture text. Invent everything.

## Out of Scope
Any DocSpine code. Reviewers should expect zero TypeScript under src/. The fixture's defects will produce findings only after later parcels land — EXPECTED-FINDINGS.md documents what WILL be found, keyed to claim kinds and finding statuses from the contracts parcel's vocabulary.

## Existing Patterns To Follow
- Design spec §8 (audit algorithm — each step needs at least one fixture defect exercising it)
- Design spec §4 taxonomy (fixture docs should span canon-like, history-like, scratch-like, and unclassifiable)
- w1-contracts-core's ClaimKind/FindingStatus vocabulary for EXPECTED-FINDINGS.md keys (coordinate naming; if contracts haven't merged when this parcel finishes, use the spec's names and reconcile at review)

## Contract
Required defect inventory (minimum; each row = at least one fixture artifact + one EXPECTED-FINDINGS entry):

| # | Defect | Exercises |
|---|--------|-----------|
| 1 | Doc referencing a path that does not exist | path/broken |
| 2 | Doc referencing a path that was git-renamed (fixture includes the rename in its seeded git history via setup script) | path/moved |
| 3 | Doc referencing a backticked symbol absent from source | symbol/broken |
| 4 | Doc referencing an npm script not present in fixture package.json | command/broken |
| 5 | Internal markdown link to a missing anchor | link/broken |
| 6 | Two docs, near-duplicate content, conflicting claim (TTL 30 vs 60) | duplicate + contradiction candidates |
| 7 | Superseded design doc left in place, no stub, no banner | classification: history-candidate |
| 8 | PLAN-*.md half-executed plan | classification: scratch-candidate |
| 9 | src/ subsystem with zero doc coverage | coverage gap |
| 10 | One doc with fully valid frontmatter | control negative: zero findings |
| 11 | One doc with malformed frontmatter (bad enum, missing required field) | frontmatter validation errors |
| 12 | src-py/ small Python module referenced by a doc's symbol claim | symbol / status=`unverifiable` (closed union), detail substring `unverifiable_symbol_language`. NOT a fifth status — sub-reasons live in `detail` only |
| 13 | Doc with a claim on every kind, all valid | control negative: extractor precision (no false positives) |

Seeded git history: fixture ships with `setup-fixture-git.ps1` + `.sh` that init a throwaway git repo inside fixtures/messy-repo (gitignored .git), performing the rename in defect #2 and ≥ 3 commits touching a covered path (future drift-engine fuel). Tests invoke setup in a temp copy — never against the checked-in tree.

EXPECTED-FINDINGS.md format: one table row per expected finding — defect #, doc path, claim kind, expected status, expected detail substring. Machine-parseable (well-formed markdown table), because downstream tests will parse it as the oracle. The `expected status` column MUST use only the closed FindingStatus union (`ok | broken | moved | unverifiable`); degradation sub-reasons like `unverifiable_symbol_language` appear only in the detail-substring column.

## Required Tests
- None in tests/ (no DocSpine code exists to test against). Verification is structural: the parcel includes fixtures/messy-repo/verify-inventory.ps1 that asserts every EXPECTED-FINDINGS row's doc path exists and every defect # 1–13 appears at least once.

## Acceptance Criteria
- All 13 defects present, each traceable to specific fixture file(s) via EXPECTED-FINDINGS.md.
- Both control negatives (#10, #13) present — the oracle tests precision, not just recall.
- ≤ 30 files; setup scripts run clean on Windows (pwsh) and POSIX.
- fixtures/README.md states the read-only rule: additions require coordinator sign-off.

## Verification
- `pwsh fixtures/messy-repo/verify-inventory.ps1` → exits 0
- `pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP\docspine-fixture` → exits 0; temp repo shows the rename via `git log --follow`
- Manual: read EXPECTED-FINDINGS.md top to bottom; every row unambiguous.

## Collision Risk
Low during W1 (sole owner of fixtures/). Becomes a HIGH-sensitivity shared asset after merge: every later parcel reads it as oracle. Post-merge changes require coordinator sign-off (index: Collision-Risk Files).

## PR Notes
- What changed: fixture repo + oracle + setup/verify scripts
- Why: shared test bed for all W1/W2 parcels and the future wedge demo asset (docs/STRATEGY-docspine.md §4.2)
- Risk: an ambiguous oracle row silently weakens every downstream test — review EXPECTED-FINDINGS.md hardest
- Verification: run both scripts; audit the defect inventory against this spec's table

## Stop-and-Report Rule
If a defect from the inventory cannot be represented without exceeding the 30-file cap or inventing a new claim kind, stop and report. If a required file is not in Allowed Files, stop and request a spec amendment.
