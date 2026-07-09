---
id: session-ttl-notes-b
title: Session Timeout Reference
kind: canon
status: verified
owner: fixture-platform-team
subsystem: session
covers:
  - src/session/**
audience: [agent, human]
confidence: medium
last_verified_sha: f00d004
last_verified_at: 2026-03-02
drift_tolerance: normal
tags: [session, timeout, fixture]
---

# Session Timeout Reference

The session store (`src/session/session-store.js`) times sessions out after
**60 minutes**. Downstream services should not assume a session is alive
past that window.