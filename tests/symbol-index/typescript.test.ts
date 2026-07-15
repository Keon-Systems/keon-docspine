/**
 * Tests for the TypeScript/JavaScript `SymbolIndex` backend (per the parcel
 * spec's Required Tests). Builds the index against the real
 * `fixtures/messy-repo` tree (read-only -- no seeded git history needed,
 * since no rename/history logic is involved here) for the primary
 * cross-language assertions, plus small inline temp-directory fixtures for
 * cases the shared fixture doesn't cover (a class with a method, a
 * destructured top-level const) -- and an informal smoke test against
 * DocSpine's own `src/contracts` (a real, larger TS codebase already in this
 * repo), per the parcel spec's PR Notes / Verification section.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildTypeScriptSymbolIndex } from "../../src/symbol-index/typescript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, "../../fixtures/messy-repo");
const REPO_ROOT = path.resolve(__dirname, "../..");

const tempDirs: string[] = [];

function makeTempRepo(files: Record<string, string>): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "ds-symbol-index-ts-"));
	tempDirs.push(dir);
	for (const [relPath, content] of Object.entries(files)) {
		writeFileSync(path.join(dir, relPath), content, "utf8");
	}
	return dir;
}

after(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// fixtures/messy-repo -- the real declarations this index must (and must
// not) find.
// ---------------------------------------------------------------------------

const fixtureIndex = buildTypeScriptSymbolIndex(FIXTURE_ROOT);

test("language is 'typescript'", () => {
	assert.equal(fixtureIndex.language, "typescript");
});

test("finds computeInvoiceTotal in src/billing/invoice.ts", () => {
	assert.equal(fixtureIndex.has("computeInvoiceTotal"), true);
	const found = fixtureIndex.lookup("computeInvoiceTotal");
	assert.equal(found.length, 1);
	assert.equal(found[0]?.path, "src/billing/invoice.ts");
	assert.equal(found[0]?.line, 3);
	assert.equal(found[0]?.kind, "function");
});

test("finds processCharge in src/payments/charge-processor.ts", () => {
	assert.equal(fixtureIndex.has("processCharge"), true);
	const found = fixtureIndex.lookup("processCharge");
	assert.equal(found.length, 1);
	assert.equal(found[0]?.path, "src/payments/charge-processor.ts");
	assert.equal(found[0]?.line, 8);
	assert.equal(found[0]?.kind, "function");
});

test("finds sendEmail in src/notifications/email-sender.ts", () => {
	assert.equal(fixtureIndex.has("sendEmail"), true);
	const found = fixtureIndex.lookup("sendEmail");
	assert.equal(found.length, 1);
	assert.equal(found[0]?.path, "src/notifications/email-sender.ts");
	assert.equal(found[0]?.line, 7);
	assert.equal(found[0]?.kind, "function");
});

test("finds getSessionTtlMinutes and SESSION_TTL_MINUTES in the plain .js file", () => {
	assert.equal(fixtureIndex.has("getSessionTtlMinutes"), true);
	const fn = fixtureIndex.lookup("getSessionTtlMinutes");
	assert.equal(fn.length, 1);
	assert.equal(fn[0]?.path, "src/session/session-store.js");
	assert.equal(fn[0]?.line, 10);
	assert.equal(fn[0]?.kind, "function");

	assert.equal(fixtureIndex.has("SESSION_TTL_MINUTES"), true);
	const constant = fixtureIndex.lookup("SESSION_TTL_MINUTES");
	assert.equal(constant.length, 1);
	assert.equal(constant[0]?.path, "src/session/session-store.js");
	assert.equal(constant[0]?.line, 8);
	assert.equal(constant[0]?.kind, "const");
});

test("does NOT find format_report -- it's Python, outside this index's scope", () => {
	assert.equal(fixtureIndex.has("format_report"), false);
	assert.deepEqual(fixtureIndex.lookup("format_report"), []);
});

// ---------------------------------------------------------------------------
// Class members -- inline fixture (the shared fixture has no class today).
// ---------------------------------------------------------------------------

test("class: dotted method/property lookup works; bare member-name lookup does not", () => {
	const dir = makeTempRepo({
		"widget.ts": [
			"export class Widget {",
			"  count = 0;",
			"  render(): string {",
			"    return String(this.count);",
			"  }",
			"}",
			"",
		].join("\n"),
	});
	const index = buildTypeScriptSymbolIndex(dir);

	assert.equal(index.has("Widget"), true);
	assert.equal(index.lookup("Widget")[0]?.kind, "class");

	assert.equal(index.has("Widget.render"), true);
	const method = index.lookup("Widget.render");
	assert.equal(method.length, 1);
	assert.equal(method[0]?.kind, "method");
	assert.equal(method[0]?.path, "widget.ts");
	assert.equal(method[0]?.line, 3);

	assert.equal(index.has("Widget.count"), true);
	assert.equal(index.lookup("Widget.count")[0]?.kind, "property");

	// Bare member-name lookup does NOT also match the dotted form -- a
	// deliberate scope line (Contract item 5), not an oversight.
	assert.equal(index.has("render"), false);
	assert.deepEqual(index.lookup("render"), []);
	assert.equal(index.has("count"), false);
});

// ---------------------------------------------------------------------------
// Destructured top-level const -- inline fixture, documented out-of-scope
// case.
// ---------------------------------------------------------------------------

test("destructured top-level const is correctly NOT indexed", () => {
	const dir = makeTempRepo({
		"helpers.ts": [
			"function foo() {",
			"  return { a: 1, b: 2 };",
			"}",
			"",
			"const { a, b } = foo();",
			"",
			"export function useThem(): number {",
			"  return a + b;",
			"}",
			"",
		].join("\n"),
	});
	const index = buildTypeScriptSymbolIndex(dir);

	assert.equal(index.has("foo"), true);
	assert.equal(index.has("useThem"), true);
	// The destructured bindings themselves are out of scope for v1.
	assert.equal(index.has("a"), false);
	assert.equal(index.has("b"), false);
});

// ---------------------------------------------------------------------------
// Informal smoke test against DocSpine's own src/contracts (PR Notes /
// Verification section: "run the index against DocSpine's own
// src/contracts/** ... and spot-check a handful of exported
// interfaces/functions resolve correctly").
// ---------------------------------------------------------------------------

test("smoke test: resolves real interfaces/members in src/contracts", () => {
	const contractsRoot = path.join(REPO_ROOT, "src", "contracts");
	const index = buildTypeScriptSymbolIndex(contractsRoot);

	assert.equal(index.has("SymbolIndex"), true);
	assert.equal(index.lookup("SymbolIndex")[0]?.kind, "interface");

	assert.equal(index.has("SymbolIndex.has"), true);
	assert.equal(index.lookup("SymbolIndex.has")[0]?.kind, "method");

	assert.equal(index.has("SymbolIndex.lookup"), true);
	assert.equal(index.lookup("SymbolIndex.lookup")[0]?.kind, "method");

	assert.equal(index.has("SymbolIndex.language"), true);
	assert.equal(index.lookup("SymbolIndex.language")[0]?.kind, "property");

	assert.equal(index.has("RepoContext"), true);
	assert.equal(index.has("SymbolInfo"), true);

	// Bare member-name lookup still does not match the dotted form here.
	assert.equal(index.has("has"), false);
	assert.equal(index.has("lookup"), false);
});
