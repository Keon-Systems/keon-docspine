# fixtures/

## fixtures/messy-repo/

A small (≤ 30 files), deliberately messy fake repository with exactly 13
cataloged, intentional documentation defects. It is the shared test bed for
every downstream DocSpine parcel and test suite, and doubles as a demo asset
(see `docs/STRATEGY-docspine.md` §4.2).

The oracle every test asserts against is
`fixtures/messy-repo/EXPECTED-FINDINGS.md` — read it before writing a test
against this fixture, and read it before changing the fixture.

**Read-only rule:** `fixtures/messy-repo/**` is owned end-to-end by the
`w1-fixture-repo` parcel. Once that parcel merges, this tree becomes a
HIGH-sensitivity shared asset: every later parcel's tests read
`EXPECTED-FINDINGS.md` as ground truth. **Any addition, removal, or edit to
`fixtures/messy-repo/**` after merge requires coordinator sign-off** — an
uncoordinated change here silently breaks or silently weakens every
downstream test that depends on it, and neither failure mode is loud.

To propose a change: open it against the parcel index
(`docs/PARCELS/index.md`) as a Contract Amendment, not as a routine PR.

### Verifying the fixture

```bash
pwsh fixtures/messy-repo/verify-inventory.ps1
pwsh fixtures/messy-repo/setup-fixture-git.ps1 -Target $env:TEMP/docspine-fixture-check
```

Both must exit 0. The second seeds the fixture's throwaway git history
(including the rename fixture defect #2 depends on) into a **temporary
copy** — it never mutates the checked-in tree.
