import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateFrontmatter } from "../../src/frontmatter/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(
	__dirname,
	"../../fixtures/messy-repo/docs/canon",
);

function readFixture(name: string): string {
	return readFileSync(path.join(fixturesDir, name), "utf8");
}

test("valid-frontmatter.md (defect #10, control negative) validates clean", () => {
	const raw = readFixture("valid-frontmatter.md");
	const result = validateFrontmatter(raw, "docs/canon/valid-frontmatter.md");

	assert.deepEqual(result.errors, []);
	assert.notEqual(result.data, null);
	assert.notEqual(result.frontmatter, null);
	assert.equal(result.frontmatter?.id, "fixture-conventions");
	assert.equal(result.frontmatter?.kind, "guide");
});

test("malformed-frontmatter.md (defect #11) independently detects the bad kind enum and the missing owner field", () => {
	const raw = readFixture("malformed-frontmatter.md");
	const result = validateFrontmatter(
		raw,
		"docs/canon/malformed-frontmatter.md",
	);

	// Schema-valid frontmatter must be null whenever there are any errors.
	assert.equal(result.frontmatter, null);
	// The block itself parsed as YAML fine -- `data` reflects that, per the
	// "data is non-null whenever a block existed and parsed as YAML"
	// contract, independent of schema validity.
	assert.notEqual(result.data, null);
	assert.ok(result.errors.length > 0);

	// NOTE (flagged per parcel spec Stop-and-Report Rule): the parcel spec's
	// Required Tests section describes this fixture as producing "exactly
	// the two errors" named in EXPECTED-FINDINGS.md defect #11. The fixture
	// as it actually exists on disk is missing FOUR required fields (owner,
	// last_verified_sha, last_verified_at, drift_tolerance) in addition to
	// the bad `kind` enum value -- five schema violations total, not two.
	// EXPECTED-FINDINGS.md only documents two of these five as expected
	// findings (frontmatter_invalid:bad_enum_kind,
	// frontmatter_invalid:missing_required_field_owner). Rather than assert
	// an error count the real schema+fixture combination cannot produce,
	// this test asserts the Acceptance Criteria's actual bar: both named
	// problems are independently detected and reported, as readable
	// messages, among whatever errors ajv produces.
	const badKindError = result.errors.find(
		(e) => e.includes("kind") && e.includes("cannon"),
	);
	const missingOwnerError = result.errors.find(
		(e) => e.includes("owner") && /required/i.test(e),
	);
	assert.ok(
		badKindError,
		`expected a readable "bad kind enum" error, got: ${JSON.stringify(result.errors)}`,
	);
	assert.ok(
		missingOwnerError,
		`expected a readable "missing owner" error, got: ${JSON.stringify(result.errors)}`,
	);
});

test("kind: canon with no covers field -> schema-conditional-rule error", () => {
	const raw = `---
id: canon-no-covers
title: Canon Doc Missing Covers
kind: canon
status: verified
owner: platform-team
subsystem: session
audience: [human]
confidence: high
last_verified_sha: null
last_verified_at: null
drift_tolerance: normal
tags: []
---

Body text with no covers field set, despite kind: canon requiring one.
`;
	const result = validateFrontmatter(raw, "docs/canon/no-covers.md");

	assert.equal(result.frontmatter, null);
	const coversError = result.errors.find(
		(e) => e.includes("covers") && /required/i.test(e),
	);
	assert.ok(
		coversError,
		`expected a "covers is required" error, got: ${JSON.stringify(result.errors)}`,
	);
});

test("no frontmatter block at all -> data: null, frontmatter: null, clear error", () => {
	const raw = "# Just a heading\n\nSome body text with no frontmatter block.\n";
	const result = validateFrontmatter(raw, "docs/canon/no-frontmatter.md");

	assert.equal(result.data, null);
	assert.equal(result.frontmatter, null);
	assert.equal(result.errors.length, 1);
	assert.match(result.errors[0] ?? "", /no frontmatter block found/i);
});

test("frontmatter block present but fails to parse as YAML -> data: null, frontmatter: null, YAML-parse-failure error", () => {
	const raw = "---\nid: bad\ntitle: [unterminated\n---\nbody\n";
	const result = validateFrontmatter(raw, "docs/canon/bad-yaml.md");

	assert.equal(result.data, null);
	assert.equal(result.frontmatter, null);
	assert.equal(result.errors.length, 1);
	assert.match(result.errors[0] ?? "", /yaml/i);
});
