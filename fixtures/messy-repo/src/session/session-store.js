// Session storage for the fixture app.
//
// Fixture note: this constant is the ACTUAL ttl (code is truth). Two docs —
// docs/canon/session-ttl-a.md and docs/canon/session-ttl-b.md — disagree
// with each other (30 vs 60 minutes) and, incidentally, with this file too.
// That pair is fixture defect #6 (near-duplicate docs, conflicting claim).

const SESSION_TTL_MINUTES = 45;

function getSessionTtlMinutes() {
  return SESSION_TTL_MINUTES;
}

module.exports = { getSessionTtlMinutes, SESSION_TTL_MINUTES };