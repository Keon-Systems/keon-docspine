/**
 * Precision/recall tests for the path extractor, on inline doc samples
 * (per the parcel spec's Required Tests). Covers all three sources named
 * in `src/extractors/paths.ts`'s header (backtick-fenced paths, relative
 * Markdown links, bare paths in prose) plus the false-positive guards a
 * "one extractor family" design needs: backticked symbols, shell commands
 * inside fenced blocks, anchor-only links, and URLs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedDoc } from "../../src/contracts/index.js";
import { pathExtractor } from "../../src/extractors/paths.js";

function makeDoc(body: string, docPath = "docs/canon/sample.md"): ParsedDoc {
	return {
		id: docPath,
		path: docPath,
		frontmatter: null,
		frontmatterErrors: [],
		body,
	};
}

test("extracts a backtick-fenced path claim", () => {
	const doc = makeDoc("See `src/payments/processor.ts` for details.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "path");
	assert.equal(claims[0]?.value, "src/payments/processor.ts");
	assert.equal(claims[0]?.raw, "`src/payments/processor.ts`");
	assert.equal(claims[0]?.docId, doc.id);
	assert.equal(claims[0]?.line, 1);
});

test("resolves a relative markdown link against the doc's own path", () => {
	const doc = makeDoc(
		"See [the guide](../guide/setup.md) for onboarding.\n",
		"docs/canon/x.md",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "docs/guide/setup.md");
});

test("resolves a same-directory relative markdown link", () => {
	const doc = makeDoc(
		"See [siblings](sibling.md) for the related doc.\n",
		"docs/canon/x.md",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "docs/canon/sibling.md");
});

test("extracts a bare path in prose (no backticks, no link syntax)", () => {
	const doc = makeDoc(
		"Configuration lives in src/config/loader.ts and nowhere else.\n",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "src/config/loader.ts");
});

test("does not extract a backticked symbol (no slash) as a path", () => {
	const doc = makeDoc("Call `getInvoicePdf()` to render the PDF.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a bare identifier as a path", () => {
	const doc = makeDoc("Invoice totals are computed by computeInvoiceTotal.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a command inside a fenced code block as a path", () => {
	const doc = makeDoc("```bash\nnpm run build:prod\n```\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a path-like token inside a fenced code block (documented scope limit)", () => {
	// Deliberate, documented product decision (see file header): fenced
	// blocks are command-extraction territory, masked out entirely before
	// path scanning, even when they contain a path-shaped token.
	const doc = makeDoc("```bash\ncd src/payments/processor.ts\n```\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract an anchor-only markdown link as a path", () => {
	const doc = makeDoc("See [Rollback](#rollback-procedure) below.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a URL as a path claim", () => {
	const doc = makeDoc(
		"See https://example.com/path/to/file.png for the mockup.\n",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("does not extract a URL inside a markdown link as a path claim", () => {
	const doc = makeDoc("See [the mockup](https://example.com/file.png).\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("normalizes a leading './' in a backtick-fenced path", () => {
	const doc = makeDoc("Entry point: `./src/index.ts`\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "src/index.ts");
});

test("strips trailing sentence punctuation from a bare prose path", () => {
	const doc = makeDoc("The entry point is src/index.ts.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "src/index.ts");
});

test("line numbers are 1-indexed within doc.body across multiple lines", () => {
	const doc = makeDoc("line one\nline two\nSee `src/foo/bar.ts` here.\n");
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.line, 3);
});

test("extracts multiple distinct path claims from one doc, one per matched span", () => {
	const doc = makeDoc(
		"Refund handling lives in `src/payments/refund-handler.ts`.\n" +
			"Charge processing lives in `src/payments/processor.ts`.\n",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 2);
	assert.deepEqual(
		claims.map((c) => c.value).sort(),
		["src/payments/processor.ts", "src/payments/refund-handler.ts"].sort(),
	);
});

test("extracts multi-dot and dotfile paths (e.g. .test.ts, .schema.json, .github/workflows/ci.yml)", () => {
	const doc = makeDoc(
		"See `tests/extractors/paths.test.ts`, `schemas/report.schema.json`, and `.github/workflows/ci.yml`.\n",
	);
	const claims = pathExtractor.extract(doc);
	assert.deepEqual(
		claims.map((c) => c.value),
		[
			"tests/extractors/paths.test.ts",
			"schemas/report.schema.json",
			".github/workflows/ci.yml",
		],
	);
});

test("masks 4-backtick and tilde fences without leaking inner paths", () => {
	const doc = makeDoc(
		"````md\n```bash\ncat src/hidden/file.ts\n```\n````\n" +
			"~~~bash\ncat src/also-hidden/file.ts\n~~~\n" +
			"Real path: `src/visible/file.ts`\n",
	);
	const claims = pathExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "src/visible/file.ts");
	assert.equal(claims[0]?.line, 9);
});
