// Outbound email delivery for the fixture app.
//
// Fixture note: no doc under docs/ carries this path in its `covers` list —
// that absence is fixture defect #9 (zero doc coverage for a real
// subsystem).

export function sendEmail(to: string, subject: string, body: string): void {
  // fixture stub: no real network call
  void to;
  void subject;
  void body;
}