// Charge processing for the payments subsystem.
//
// Fixture note: this file's checked-in name is the POST-rename name. The
// seeded git history (see setup-fixture-git.ps1 / .sh at the fixture root)
// replays this file's earlier life at src/payments/processor.ts and then
// renames it here — that rename is fixture defect #2 (path/moved).

export function processCharge(amountCents: number, customerId: string): { ok: boolean } {
  if (amountCents <= 0) {
    throw new Error("amountCents must be positive");
  }
  return { ok: true };
}