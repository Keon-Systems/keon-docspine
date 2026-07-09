---
id: payments-overview
title: Payments Subsystem Overview
kind: canon
status: verified
owner: fixture-team
subsystem: payments
covers:
  - src/payments/**
audience: [agent, human]
confidence: high
last_verified_sha: f00d001
last_verified_at: 2026-05-01
drift_tolerance: normal
tags: [payments, fixture]
---

# Payments Subsystem

The payments subsystem processes charges and refunds for the fixture app.

## Charge Flow

Charge processing lives in `src/payments/processor.ts`.

## Refunds

Refund handling lives in `src/payments/refund-handler.ts`, which walks back
a charge and reverses the ledger entry.

## Rollback

If a refund fails partway through, see [Rollback Procedure](#rollback-procedure)
below for the manual fallback.