---
id: billing-overview
title: Billing Subsystem Overview
kind: canon
status: verified
owner: fixture-team
subsystem: billing
covers:
  - src/billing/**
audience: [agent, human]
confidence: high
last_verified_sha: f00d002
last_verified_at: 2026-05-01
drift_tolerance: normal
tags: [billing, fixture]
---

# Billing Subsystem

Computes invoice totals and renders customer-facing PDFs.

## Generating a PDF

Call `getInvoicePdf()` to render the current invoice as a PDF.

## Regenerating Fixtures

Run this before shipping updated invoice templates:

```bash
npm run build:prod
```