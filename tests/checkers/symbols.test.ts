/**
 * Symbol checker tests against fixtures/messy-repo.
 *
 * Oracle cases from EXPECTED-FINDINGS.md:
 *   defect #13: computeInvoiceTotal → ok
 *   defect #3:  getInvoicePdf → broken (symbol_not_found)
 *   defect #12: format_report → unverifiable (unverifiable_symbol_language)
 *
 * The index is built once against fixtures/messy-repo (read-only — no git
 * seeding needed for symbol-index; plain filesystem walk suffices).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { symbolChecker } from "../../src/checkers/symbols.js";
import type {
	Claim,
	RepoContext,
	SymbolIndex,
} from "../../src/contracts/index.js";
import { buildTypeScriptSymbolIndex } from "../../src/symbol-index/typescript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(__dirname, "../../fixtures/messy-repo");

// Build once; all tests share this read-only index.
const index: SymbolIndex = buildTypeScriptSymbolIndex(fixtureRoot);

function claim(value: string, docId = "test-doc"): Claim {
	return { kind: "symbol", value, docId, line: 1, raw: `\`${value}\`` };
}

function ctx(symbolIndex?: SymbolIndex): RepoContext {
	return {
		root: fixtureRoot,
		symbolIndex,
		git: { isRepo: false, headSha: null, repoRoot: null },
	};
}

test("symbol found in TS index -> ok (fixture defect #13: computeInvoiceTotal)", async () => {
	const findings = await symbolChecker.check(
		[claim("computeInvoiceTotal")],
		ctx(index),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "ok");
	assert.equal(findings[0]?.detail, "symbol_exists:computeInvoiceTotal");
});

test("symbol not in TS index, found in Python file -> unverifiable (fixture defect #12: format_report)", async () => {
	const findings = await symbolChecker.check(
		[claim("format_report")],
		ctx(index),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "unverifiable");
	assert.match(findings[0]?.detail ?? "", /unverifiable_symbol_language/);
});

test("symbol not found anywhere -> broken (fixture defect #3: getInvoicePdf)", async () => {
	const findings = await symbolChecker.check(
		[claim("getInvoicePdf")],
		ctx(index),
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.status, "broken");
	assert.equal(findings[0]?.detail, "symbol_not_found:getInvoicePdf");
});

test("no symbolIndex in ctx -> all claims unverifiable_no_index", async () => {
	const findings = await symbolChecker.check(
		[
			claim("computeInvoiceTotal"),
			claim("format_report"),
			claim("getInvoicePdf"),
		],
		ctx(undefined),
	);
	assert.equal(findings.length, 3);
	for (const f of findings) {
		assert.equal(f.status, "unverifiable");
		assert.match(f.detail ?? "", /unverifiable_no_index/);
	}
});

test("mixed batch resolves all three statuses in one call", async () => {
	const findings = await symbolChecker.check(
		[
			claim("computeInvoiceTotal"), // ok — in TS index
			claim("format_report"), // unverifiable — Python
			claim("getInvoicePdf"), // broken — nowhere
		],
		ctx(index),
	);
	assert.equal(findings.length, 3);
	assert.equal(findings[0]?.status, "ok");
	assert.equal(findings[1]?.status, "unverifiable");
	assert.match(findings[1]?.detail ?? "", /unverifiable_symbol_language/);
	assert.equal(findings[2]?.status, "broken");
	assert.equal(findings[2]?.detail, "symbol_not_found:getInvoicePdf");
});

test("duplicate claims for the same symbol produce consistent findings", async () => {
	const findings = await symbolChecker.check(
		[claim("getInvoicePdf"), claim("getInvoicePdf")],
		ctx(index),
	);
	assert.equal(findings.length, 2);
	for (const f of findings) {
		assert.equal(f.status, "broken");
		assert.equal(f.detail, "symbol_not_found:getInvoicePdf");
	}
});
