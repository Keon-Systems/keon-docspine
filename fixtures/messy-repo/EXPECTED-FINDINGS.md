# EXPECTED-FINDINGS.md — messy-repo Fixture Oracle

This file is the machine-and-human-readable oracle for `fixtures/messy-repo/`.
Every downstream DocSpine test suite that runs an audit against this fixture
asserts its output against the table below. Read it top to bottom before
trusting it — an ambiguous row here silently weakens every test that depends
on it.

Vocabulary (from the contracts parcel, `src/contracts/claims.ts`):

- `ClaimKind` (closed): `path | symbol | command | link`
- `FindingStatus` (closed): `ok | broken | moved | unverifiable`
- Sub-reasons (e.g. `unverifiable_symbol_language`) live **only** in the
  detail-substring column, never in the status column.

## Legend — how to read a row

Two kinds of rows appear in this table:

1. **Per-claim rows** (defects 1, 2, 3, 4, 5, 12, 13): the row corresponds to
   exactly one extracted claim in the doc. `Claim Kind` is a real `ClaimKind`
   value and `Expected Status` is the real, closed `FindingStatus` value a
   checker must produce for that claim.
2. **Analysis-layer rows** (defects 6, 7, 8, 9, 10, 11): the defect is not a
   single ClaimFinding — it is a duplicate/contradiction candidate (§8 step
   5), a classification signal (§8 step 6), a coverage gap (§8 step 7), or a
   frontmatter-schema error (§5.1). None of those map onto one `ClaimKind`.
   For table uniformity these rows use `Claim Kind = none` — a fixture-table
   marker, **not** a member of the `ClaimKind` enum — and `Expected Status`
   is chosen as the closest honest value still inside the closed
   `FindingStatus` union (`ok` when nothing is actually broken about any
   individual claim in the doc, `broken` when the row *is* reporting a
   validation failure, as with the frontmatter defect). The actual expected
   analysis-layer finding is always spelled out in the detail-substring
   column with a `tag:value` convention.

Defect #2 depends on seeded git history that does not exist in the
checked-in tree. Run `setup-fixture-git.ps1` / `.sh` against a temp copy
first (see that script's header) — only the seeded copy can distinguish
"moved" from "broken" for `src/payments/processor.ts`.

## Findings

| Defect # | Doc Path | Claim Kind | Expected Status | Expected Detail Substring |
|---|---|---|---|---|
| 1 | docs/canon/payments.md | path | broken | path_not_found |
| 2 | docs/canon/payments.md | path | moved | renamed_via_git_follow |
| 3 | docs/canon/billing.md | symbol | broken | symbol_not_found:getInvoicePdf |
| 4 | docs/canon/billing.md | command | broken | npm_script_not_found:build:prod |
| 5 | docs/canon/payments.md | link | broken | anchor_not_found:rollback-procedure |
| 6 | docs/canon/session-ttl-a.md | path | ok | contradiction_candidate:ttl_30_vs_60 |
| 6 | docs/canon/session-ttl-b.md | path | ok | contradiction_candidate:ttl_30_vs_60 |
| 7 | docs/canon/legacy-auth-design.md | none | ok | classification_candidate:history_no_banner |
| 8 | docs/scratch/PLAN-refactor-billing.md | none | ok | classification_candidate:scratch_half_executed |
| 9 | src/notifications/email-sender.ts | none | ok | coverage_gap:no_doc_covers_subsystem |
| 10 | docs/canon/valid-frontmatter.md | none | ok | zero_findings_expected:control_negative |
| 11 | docs/canon/malformed-frontmatter.md | none | broken | frontmatter_invalid:bad_enum_kind |
| 11 | docs/canon/malformed-frontmatter.md | none | broken | frontmatter_invalid:missing_required_field_owner |
| 12 | docs/canon/metrics.md | path | ok | path_exists:src-py/report_utils.py |
| 12 | docs/canon/metrics.md | symbol | unverifiable | unverifiable_symbol_language |
| 13 | docs/canon/all-claim-kinds-valid.md | path | ok | path_exists:src/billing/invoice.ts |
| 13 | docs/canon/all-claim-kinds-valid.md | symbol | ok | symbol_exists:computeInvoiceTotal |
| 13 | docs/canon/all-claim-kinds-valid.md | command | ok | npm_script_exists:test |
| 13 | docs/canon/all-claim-kinds-valid.md | link | ok | anchor_exists:overview |

## Defect index (for quick cross-reference against the parcel spec)

| # | Defect | Fixture artifact(s) |
|---|---|---|
| 1 | Doc references a nonexistent path | docs/canon/payments.md → `src/payments/refund-handler.ts` |
| 2 | Doc references a git-renamed path | docs/canon/payments.md → `src/payments/processor.ts` (renamed to `src/payments/charge-processor.ts` in seeded git history) |
| 3 | Doc references a backticked symbol absent from source | docs/canon/billing.md → `getInvoicePdf()` |
| 4 | Doc references an npm script not in package.json | docs/canon/billing.md → `npm run build:prod` |
| 5 | Internal markdown link to a missing anchor | docs/canon/payments.md → `#rollback-procedure` |
| 6 | Two near-duplicate docs, conflicting TTL claim | docs/canon/session-ttl-a.md (30 min) vs docs/canon/session-ttl-b.md (60 min); code truth is 45 min in src/session/session-store.js |
| 7 | Superseded design doc, no stub/banner | docs/canon/legacy-auth-design.md |
| 8 | PLAN-\*.md half-executed plan | docs/scratch/PLAN-refactor-billing.md |
| 9 | src/ subsystem with zero doc coverage | src/notifications/email-sender.ts |
| 10 | Fully valid frontmatter (control negative) | docs/canon/valid-frontmatter.md |
| 11 | Malformed frontmatter (bad enum + missing field) | docs/canon/malformed-frontmatter.md |
| 12 | src-py/ module, symbol claim must be `unverifiable` | docs/canon/metrics.md → `format_report` in src-py/report_utils.py |
| 13 | One claim of every kind, all valid (control negative) | docs/canon/all-claim-kinds-valid.md |