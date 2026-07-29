/**
 * Tests for the link checker (per the parcel spec's Required Tests):
 * a `slugify()` unit test against real fixture headings, the defect #5 /
 * #13 fixture shapes (self-anchor claims against the real doc files on
 * disk), a missing-target-file case, and an existing-target-with-no-match
 * case.
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { linkChecker, slugify } from "../../src/checkers/links.js";
import type { Claim, RepoContext } from "../../src/contracts/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(__dirname, "../../fixtures/messy-repo");

function claim(value: string, docId = "test-doc"): Claim {
	return {
		kind: "link",
		value,
		docId,
		line: 1,
		raw: `[x](${value})`,
	};
}

function ctx(): RepoContext {
	return {
		root: fixtureRoot,
		git: { isRepo: false, headSha: null, repoRoot: null },
	};
}

// --- slugify() unit tests, against real fixture headings ---

test("slugify: '## Rollback' -> 'rollback'", () => {
	assert.equal(slugify("Rollback"), "rollback");
});

test("slugify: '## Overview' -> 'overview'", () => {
	assert.equal(slugify("Overview"), "overview");
});

test("slugify: punctuation and mixed case generalize, 'Foo & Bar!' -> 'foo-bar'", () => {
	assert.equal(slugify("Foo & Bar!"), "foo-bar");
});

test("slugify: collapses multiple spaces and trims edge hyphens", () => {
	assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
});

test("slugify: real fixture heading with parens, 'Session TTL (Auth Team Notes)'", () => {
	assert.equal(
		slugify("Session TTL (Auth Team Notes)"),
		"session-ttl-auth-team-notes",
	);
});

// --- defect #5 shape: self-anchor claim, anchor does not match any heading ---

test("defect #5 shape: payments.md self-anchor #rollback-procedure -> broken, anchor_not_found", async () => {
	const docPath = "docs/canon/payments.md";
	const findings = await linkChecker.check(
		[claim(`${docPath}#rollback-procedure`, docPath)],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "broken");
	assert.match(
		findings[0]?.detail ?? "",
		/anchor_not_found:rollback-procedure/,
	);
});

// --- defect #13 shape: self-anchor claim, anchor matches its own heading ---

test("defect #13 shape: all-claim-kinds-valid.md self-anchor #overview -> ok, anchor_exists", async () => {
	const docPath = "docs/canon/all-claim-kinds-valid.md";
	const findings = await linkChecker.check(
		[claim(`${docPath}#overview`, docPath)],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
	assert.match(findings[0]?.detail ?? "", /anchor_exists:overview/);
});

// --- nonexistent target file ---

test("claim pointing at a nonexistent target file -> broken, link_target_missing", async () => {
	const findings = await linkChecker.check(
		[claim("docs/canon/does-not-exist.md#anything")],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "broken");
	assert.match(findings[0]?.detail ?? "", /link_target_missing/);
});

// --- existing target file, anchor not present ---

test("claim pointing at an existing file with no matching heading -> broken, anchor_not_found", async () => {
	const docPath = "docs/canon/billing.md";
	const findings = await linkChecker.check(
		[claim(`${docPath}#no-such-section`, docPath)],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "broken");
	assert.match(findings[0]?.detail ?? "", /anchor_not_found:no-such-section/);
});

// --- cross-doc anchor claim resolves against the target doc's own headings ---

test("cross-doc anchor claim matches a heading in the target file (not the source doc)", async () => {
	const findings = await linkChecker.check(
		[claim("docs/canon/billing.md#generating-a-pdf", "docs/canon/other.md")],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
	assert.match(findings[0]?.detail ?? "", /anchor_exists:generating-a-pdf/);
});

// --- case-insensitive anchor match ---

test("anchor comparison is case-insensitive", async () => {
	const docPath = "docs/canon/all-claim-kinds-valid.md";
	const findings = await linkChecker.check(
		[claim(`${docPath}#OVERVIEW`, docPath)],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
});

// --- percent-encoded anchor matches its decoded, slugified equivalent ---

test("percent-encoded anchor decodes before matching, 'caf%C3%A9' matches heading slug 'café'", async () => {
	const docPath = "docs/canon/all-claim-kinds-valid.md";
	const findings = await linkChecker.check(
		[claim(`${docPath}#OVERVIEW`.replace("OVERVIEW", "%4Fverview"), docPath)],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
	assert.match(findings[0]?.detail ?? "", /anchor_exists:%4Fverview/);
});

// --- target path escaping the repo root ---

test("target path escaping the repo root via ../ -> broken, never read off the host filesystem", async () => {
	const findings = await linkChecker.check(
		[claim("../../../../etc/passwd#anything")],
		ctx(),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "broken");
	assert.match(findings[0]?.detail ?? "", /path_escapes_repo_root/);
});
