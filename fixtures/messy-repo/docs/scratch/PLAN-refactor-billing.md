---
id: plan-refactor-billing
title: "PLAN: Refactor Billing Total Calculation"
kind: scratch
status: draft
owner: fixture-billing-team
subsystem: billing
audience: [agent, human]
confidence: low
expires: 2026-08-15
tags: [plan, billing, fixture]
---

# PLAN: Refactor Billing Total Calculation

Half-executed migration plan. Do not treat as current state — per the
design spec's trust rules, kind=scratch is intent, not state.

## Tasks

- [x] Add the new total calculation helper
- [x] Wire the helper into the invoice renderer
- [ ] Remove the old calculation path
- [ ] Update the billing doc to describe the new helper
- [ ] Delete this plan once the migration is confirmed shipped