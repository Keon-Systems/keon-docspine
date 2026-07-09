---
id: session-ttl-notes-a
title: Session TTL Notes (Auth Team)
kind: canon
status: verified
owner: fixture-auth-team
subsystem: session
covers:
  - src/session/**
audience: [agent, human]
confidence: high
last_verified_sha: f00d003
last_verified_at: 2026-04-10
drift_tolerance: normal
tags: [session, ttl, fixture]
---

# Session TTL (Auth Team Notes)

Sessions are stored via `src/session/session-store.js` and expire after
**30 minutes** of inactivity. Clients should treat any session older than
30 minutes as invalid and force re-authentication.