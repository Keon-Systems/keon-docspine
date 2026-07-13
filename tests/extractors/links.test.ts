/**
 * Precision/recall tests for the link (anchor) extractor, on inline doc
 * samples (per the parcel spec's Required Tests). Covers the two link
 * shapes (self-anchor, cross-doc anchor), the "no double-extraction with
 * paths.ts" boundary (plain path-only links), the out-of-scope link kinds
 * (external URL, mailto:), line numbering, and the two real fixture cases
 * from `fixtures/messy-repo/docs/canon/payments.md` (defect #5) and
 * `fixtures/messy-repo/docs/canon/all-claim-kinds-valid.md` (defect #13).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedDoc } from "../../src/contracts/index.js";
import { linkExtractor } from "../../src/extractors/links.js";

function makeDoc(body: string, docPath = "docs/canon/sample.md"): ParsedDoc {
	return {
		id: docPath,
		path: docPath,
		frontmatter: null,
		frontmatterErrors: [],
		body,
	};
}

test("extracts a self-anchor link, value is <doc.path>#<anchor>", () => {
	const doc = makeDoc("See [Rollback](#rollback-procedure) below.\n");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "link");
	assert.equal(claims[0]?.value, "docs/canon/sample.md#rollback-procedure");
	assert.equal(claims[0]?.raw, "[Rollback](#rollback-procedure)");
	assert.equal(claims[0]?.docId, doc.id);
	assert.equal(claims[0]?.line, 1);
});

test("extracts a cross-doc anchor link, path resolved relative to doc's directory", () => {
	const doc = makeDoc(
		"See [Rollback](payments.md#rollback-procedure) below.\n",
		"docs/canon/x.md",
	);
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "docs/canon/payments.md#rollback-procedure");
});

test("resolves a cross-doc anchor link through a parent-directory relative path", () => {
	const doc = makeDoc(
		"See [the guide](../guide/setup.md#install) for onboarding.\n",
		"docs/canon/x.md",
	);
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "docs/guide/setup.md#install");
});

test("plain path-only link with no anchor produces zero link claims", () => {
	const doc = makeDoc("See [siblings](sibling.md) for the related doc.\n");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("external URL with a fragment produces zero link claims", () => {
	const doc = makeDoc("See [the docs](https://example.com/x#foo) online.\n");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("mailto: link produces zero link claims", () => {
	const doc = makeDoc("Contact [support](mailto:help@example.com#foo).\n");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("a markdown link inside a fenced code block is not extracted", () => {
	const doc = makeDoc("```md\n[Rollback](#rollback-procedure)\n```\n");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("line numbers are 1-indexed within doc.body across multiple lines", () => {
	const doc = makeDoc(
		"line one\nline two\nSee [Rollback](#rollback-procedure) here.\n",
	);
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.line, 3);
});

test("extracts multiple distinct link claims from one doc, one per matched span", () => {
	const doc = makeDoc(
		"See [Rollback](#rollback-procedure) above.\n" +
			"See [Overview](other.md#overview) too.\n",
		"docs/canon/x.md",
	);
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 2);
	assert.deepEqual(
		claims.map((c) => c.value).sort(),
		[
			"docs/canon/other.md#overview",
			"docs/canon/x.md#rollback-procedure",
		].sort(),
	);
});

// --- Real fixture cases (fixtures/messy-repo/EXPECTED-FINDINGS.md) ---
//
// These mirror the actual doc text (minus frontmatter, which is stripped
// before `Extractor.extract` ever sees a `ParsedDoc.body`) so this parcel's
// own tests double as a preview of what `w1-check-links` must later resolve
// correctly.

test("defect #5 fixture shape: payments.md self-anchor link to a missing anchor", () => {
	// fixtures/messy-repo/docs/canon/payments.md body, verbatim.
	const body =
		"\n" +
		"# Payments Subsystem\n" +
		"\n" +
		"The payments subsystem processes charges and refunds for the fixture app.\n" +
		"\n" +
		"## Charge Flow\n" +
		"\n" +
		"Charge processing lives in `src/payments/processor.ts`.\n" +
		"\n" +
		"## Refunds\n" +
		"\n" +
		"Refund handling lives in `src/payments/refund-handler.ts`, which walks back\n" +
		"a charge and reverses the ledger entry.\n" +
		"\n" +
		"## Rollback\n" +
		"\n" +
		"If a refund fails partway through, see [Rollback Procedure](#rollback-procedure)\n" +
		"below for the manual fallback.\n";
	const doc = makeDoc(body, "docs/canon/payments.md");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "link");
	assert.equal(claims[0]?.value, "docs/canon/payments.md#rollback-procedure");
	assert.equal(claims[0]?.raw, "[Rollback Procedure](#rollback-procedure)");
});

test("defect #13 fixture shape: all-claim-kinds-valid.md self-anchor link matching its own heading", () => {
	// fixtures/messy-repo/docs/canon/all-claim-kinds-valid.md body, verbatim.
	const body =
		"\n" +
		"# Every Claim Kind, All Valid\n" +
		"\n" +
		"Control negative: one claim of each kind, every one of them checks out.\n" +
		"The extractor must not manufacture a false positive from this file.\n" +
		"\n" +
		"## Overview\n" +
		"\n" +
		"Invoice totals are computed by `computeInvoiceTotal`, defined in\n" +
		"`src/billing/invoice.ts`.\n" +
		"\n" +
		"Run the test suite with:\n" +
		"\n" +
		"```bash\n" +
		"npm run test\n" +
		"```\n" +
		"\n" +
		"See the [Overview](#overview) section above for the source of truth.\n";
	const doc = makeDoc(body, "docs/canon/all-claim-kinds-valid.md");
	const claims = linkExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "link");
	assert.equal(
		claims[0]?.value,
		"docs/canon/all-claim-kinds-valid.md#overview",
	);
	assert.equal(claims[0]?.raw, "[Overview](#overview)");
});
