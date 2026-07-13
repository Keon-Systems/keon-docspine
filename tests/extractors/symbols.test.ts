/**
 * Precision/recall tests for the symbol extractor, on inline doc samples
 * (per the parcel spec's Required Tests), plus reproduction cases against
 * the real `fixtures/messy-repo` docs named in the parcel spec's Existing
 * Patterns / Acceptance Criteria (defects #3, #12, #13 in
 * `fixtures/messy-repo/EXPECTED-FINDINGS.md`) — proving this extractor
 * alone produces the right `Claim` objects from those fixture docs' raw
 * text, even though wiring it into a registry is another parcel's job.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ParsedDoc } from "../../src/contracts/index.js";
import { symbolExtractor } from "../../src/extractors/symbols.js";
import { parseDoc } from "../../src/pipeline/parse-doc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/messy-repo");

function makeDoc(body: string, docPath = "docs/canon/sample.md"): ParsedDoc {
	return {
		id: docPath,
		path: docPath,
		frontmatter: null,
		frontmatterErrors: [],
		body,
	};
}

function loadFixtureDoc(relPath: string): ParsedDoc {
	const raw = readFileSync(path.join(FIXTURE_ROOT, relPath), "utf8");
	return parseDoc(relPath, raw).doc;
}

test("extracts a plain identifier symbol claim", () => {
	const doc = makeDoc("Call `getInvoicePdf` to render the invoice.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "symbol");
	assert.equal(claims[0]?.value, "getInvoicePdf");
	assert.equal(claims[0]?.raw, "`getInvoicePdf`");
	assert.equal(claims[0]?.docId, doc.id);
	assert.equal(claims[0]?.line, 1);
});

test("strips trailing call parens from the claim value", () => {
	const doc = makeDoc("Call `getInvoicePdf()` to render the invoice.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "getInvoicePdf");
	assert.equal(claims[0]?.raw, "`getInvoicePdf()`");
});

test("extracts a dotted identifier symbol claim", () => {
	const doc = makeDoc("See `SessionService.SetAsync` for details.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "SessionService.SetAsync");
});

test("does not extract a path-shaped span as a symbol", () => {
	const doc = makeDoc("See `src/foo.ts` for details.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a bare shell flag as a symbol", () => {
	const doc = makeDoc("Run the build with `--prod` enabled.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a short shell flag as a symbol", () => {
	const doc = makeDoc("Pass `-x` to enable tracing.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a pure number as a symbol", () => {
	const doc = makeDoc("The timeout is `42` seconds.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a symbol-looking token inside a fenced code block", () => {
	const doc = makeDoc(
		"```ts\nconst x = getInvoicePdf();\n```\n",
		"docs/canon/sample.md",
	);
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a backticked symbol inside a fenced code block", () => {
	// The fence itself is masked before scanning, so a backtick span that
	// happens to sit inside a fenced block (unusual, but not impossible in
	// raw markdown) never reaches the inline-code scan either.
	const doc = makeDoc("```\n`getInvoicePdf()`\n```\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("line numbers are 1-indexed within doc.body across multiple lines", () => {
	const doc = makeDoc(
		"line one\nline two\nSee `SessionService.SetAsync` here.\n",
	);
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.line, 3);
});

test("extracts multiple distinct symbol claims from one doc, one per matched span", () => {
	const doc = makeDoc(
		"Call `getInvoicePdf()` first.\n" +
			"Then call `SessionService.SetAsync` to persist state.\n",
	);
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 2);
	assert.deepEqual(
		claims.map((c) => c.value).sort(),
		["SessionService.SetAsync", "getInvoicePdf"].sort(),
	);
});

test("does not extract a whitespace-only backtick span as a symbol", () => {
	const doc = makeDoc("Nothing here: ` ` at all.\n");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

// ---------------------------------------------------------------------------
// Real fixture docs (fixtures/messy-repo) — EXPECTED-FINDINGS.md defects
// #3, #12, #13. These prove the extractor alone reproduces the expected
// symbol claims from the actual raw fixture text; wiring into a registry
// (and the symbol checker itself) are other parcels' jobs.
// ---------------------------------------------------------------------------

test("fixture: docs/canon/billing.md yields the getInvoicePdf symbol claim (defect #3)", () => {
	const doc = loadFixtureDoc("docs/canon/billing.md");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "getInvoicePdf");
	assert.equal(claims[0]?.raw, "`getInvoicePdf()`");
	assert.equal(claims[0]?.docId, doc.id);
});

test("fixture: docs/canon/metrics.md yields the format_report symbol claim (defect #12)", () => {
	const doc = loadFixtureDoc("docs/canon/metrics.md");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "format_report");
	assert.equal(claims[0]?.raw, "`format_report`");
	assert.equal(claims[0]?.docId, doc.id);
});

test("fixture: docs/canon/all-claim-kinds-valid.md yields the computeInvoiceTotal symbol claim (defect #13)", () => {
	const doc = loadFixtureDoc("docs/canon/all-claim-kinds-valid.md");
	const claims = symbolExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "computeInvoiceTotal");
	assert.equal(claims[0]?.raw, "`computeInvoiceTotal`");
	assert.equal(claims[0]?.docId, doc.id);
});
