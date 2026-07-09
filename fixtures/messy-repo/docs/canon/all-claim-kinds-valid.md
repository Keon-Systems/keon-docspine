---
id: all-claim-kinds-valid
title: Every Claim Kind, All Valid
kind: canon
status: verified
owner: fixture-team
subsystem: billing
covers:
  - src/billing/**
audience: [agent, human]
confidence: high
last_verified_sha: f00d008
last_verified_at: 2026-06-15
drift_tolerance: normal
tags: [fixture, control-negative]
---

# Every Claim Kind, All Valid

Control negative: one claim of each kind, every one of them checks out.
The extractor must not manufacture a false positive from this file.

## Overview

Invoice totals are computed by `computeInvoiceTotal`, defined in
`src/billing/invoice.ts`.

Run the test suite with:

```bash
npm run test
```

See the [Overview](#overview) section above for the source of truth.