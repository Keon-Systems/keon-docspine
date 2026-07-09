---
id: legacy-auth-design
title: Authentication Design Notes
kind: canon
status: verified
owner: fixture-auth-team
subsystem: auth
covers:
  - src/session/**
audience: [agent, human]
confidence: medium
last_verified_sha: f00d005
last_verified_at: 2024-01-15
drift_tolerance: loose
tags: [auth, fixture, legacy]
---

# Authentication Design Notes

In 2024 we chose server-side session cookies over token-based auth for the
initial launch, because the client SDK did not support token refresh yet.

The fixture app has since moved to the token-based flow described in the
current session docs, but these notes were never migrated to history and
never got a superseded banner or a supersedes pointer — which is itself
the fixture defect: a design doc that reads like history but was left
sitting in canon, uncontained.