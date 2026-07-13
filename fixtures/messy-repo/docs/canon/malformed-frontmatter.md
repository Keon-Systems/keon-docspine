---
id: malformed-frontmatter-example
title: Malformed Frontmatter Example
kind: cannon
status: verified
subsystem: meta
audience: [agent, human]
confidence: high
last_verified_sha: null
last_verified_at: null
drift_tolerance: normal
tags: [fixture, frontmatter]
---

# Malformed Frontmatter Example

This doc's frontmatter is deliberately invalid: the kind field is set to an
enum value that does not exist, and the required owner field is missing
entirely. Body content is intentionally free of checkable claims so the
only expected findings are the two frontmatter-schema errors described in
EXPECTED-FINDINGS.md.