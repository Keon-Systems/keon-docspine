/**
 * Precision/recall tests for the command extractor, on inline doc samples
 * (per the parcel spec's Required Tests). Covers the two recognized npm
 * invocation shapes, the raw-line fallback for unrecognized shell lines,
 * comment/blank-line skipping, non-shell fenced blocks, inline backtick
 * spans outside any fence, and line numbering across a multi-fence doc.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedDoc } from "../../src/contracts/index.js";
import { commandExtractor } from "../../src/extractors/commands.js";

function makeDoc(body: string, docPath = "docs/canon/sample.md"): ParsedDoc {
	return {
		id: docPath,
		path: docPath,
		frontmatter: null,
		frontmatterErrors: [],
		body,
	};
}

test("extracts an `npm run <script>` line inside a ```bash fence", () => {
	const doc = makeDoc("```bash\nnpm run build:prod\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "command");
	assert.equal(claims[0]?.value, "build:prod");
	assert.equal(claims[0]?.raw, "npm run build:prod");
	assert.equal(claims[0]?.docId, doc.id);
	assert.equal(claims[0]?.line, 2);
});

test("extracts a bare `npm test` line with value 'test'", () => {
	const doc = makeDoc("```bash\nnpm test\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "test");
	assert.equal(claims[0]?.raw, "npm test");
});

test("a non-npm shell line inside a fence still produces a claim, raw text as value", () => {
	const doc = makeDoc("```bash\ncurl -s https://example.com/health\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "curl -s https://example.com/health");
	assert.equal(claims[0]?.raw, "curl -s https://example.com/health");
});

test("a comment line inside a fence produces zero claims", () => {
	const doc = makeDoc("```bash\n# this is a comment\nnpm test\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "test");
});

test("a blank line inside a fence produces zero claims", () => {
	const doc = makeDoc("```bash\n\nnpm test\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "test");
});

test("content inside a ```ts (non-shell) fenced block produces zero claims", () => {
	const doc = makeDoc(
		"```ts\nnpm run build:prod // not really a command\n```\n",
	);
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("content inside a ```json (non-shell) fenced block produces zero claims", () => {
	const doc = makeDoc(
		'```json\n{ "scripts": { "npm run test": true } }\n```\n',
	);
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("an inline single-backtick span that looks command-like produces zero claims", () => {
	const doc = makeDoc("Run `npm run build` to build the project.\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 0);
});

test("a blank info string (bare ```) fence is in scope", () => {
	const doc = makeDoc("```\nnpm run lint\n```\n");
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "lint");
});

test("sh, shell, and console info strings are all in scope", () => {
	const doc = makeDoc(
		"```sh\nnpm run a\n```\n\n```shell\nnpm run b\n```\n\n```console\nnpm run c\n```\n",
	);
	const claims = commandExtractor.extract(doc);
	assert.deepEqual(
		claims.map((c) => c.value),
		["a", "b", "c"],
	);
});

test("correct line numbers across a multi-fence, multi-line doc body", () => {
	const doc = makeDoc(
		"# Title\n" +
			"\n" +
			"Some prose with `npm run build` inline (not a claim).\n" +
			"\n" +
			"```bash\n" + // line 5
			"npm run build:prod\n" + // line 6
			"npm test\n" + // line 7
			"```\n" +
			"\n" +
			"More prose.\n" +
			"\n" +
			"```ts\n" +
			"npm run ignored\n" +
			"```\n" +
			"\n" +
			"```bash\n" + // line 16
			"docker build .\n" + // line 17
			"```\n",
	);
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 3);
	assert.deepEqual(
		claims.map((c) => ({ value: c.value, line: c.line, raw: c.raw })),
		[
			{ value: "build:prod", line: 6, raw: "npm run build:prod" },
			{ value: "test", line: 7, raw: "npm test" },
			{ value: "docker build .", line: 17, raw: "docker build ." },
		],
	);
});

test("fixture defect #4: billing.md's `npm run build:prod` fence line", () => {
	const doc = makeDoc(
		"# Billing Subsystem\n" +
			"\n" +
			"Run this before shipping updated invoice templates:\n" +
			"\n" +
			"```bash\n" +
			"npm run build:prod\n" +
			"```\n",
		"docs/canon/billing.md",
	);
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.kind, "command");
	assert.equal(claims[0]?.value, "build:prod");
	assert.equal(claims[0]?.docId, "docs/canon/billing.md");
});

test("strips leading '$ ' prompt and recognizes pnpm/yarn/bun run and npm start", () => {
	const doc = makeDoc(
		"~~~bash\n$ npm run verify\npnpm run build\nyarn run lint\nbun run test\nnpm start\nnpm test -- --watch\n~~~\n",
	);
	const claims = commandExtractor.extract(doc);
	assert.deepEqual(
		claims.map((c) => c.value),
		["verify", "build", "lint", "test", "start", "test"],
	);
});

test("fixture defect #13 control negative: all-claim-kinds-valid.md's `npm run test` fence line", () => {
	const doc = makeDoc(
		"# Every Claim Kind, All Valid\n" +
			"\n" +
			"Run the test suite with:\n" +
			"\n" +
			"```bash\n" +
			"npm run test\n" +
			"```\n",
		"docs/canon/all-claim-kinds-valid.md",
	);
	const claims = commandExtractor.extract(doc);
	assert.equal(claims.length, 1);
	assert.equal(claims[0]?.value, "test");
	assert.equal(claims[0]?.docId, "docs/canon/all-claim-kinds-valid.md");
});
