import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import type {
	AuditReport,
	DocumentDiagnostic,
} from "../../src/contracts/index.js";
import { canonicalizeReport } from "../../src/report/canonicalize.js";
import { auditReportFixture } from "./fixtures.js";

const schema = JSON.parse(
	readFileSync(
		new URL("../../schemas/report.schema.json", import.meta.url),
		"utf8",
	),
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const diagnostic: DocumentDiagnostic = {
	path: "docs/canon/setup.md",
	code: "invalid_frontmatter",
	message: "Set the required owner field in frontmatter.",
};

test("ca-010: old reports, empty diagnostics, and both diagnostic codes validate", () => {
	for (const documentDiagnostics of [
		undefined,
		[],
		[diagnostic],
		[{ ...diagnostic, path: "docs/line\nname.md" }],
		[
			{
				path: "docs/é space.md",
				code: "unreadable_document",
				message: "Restore the tracked document or remove it from the index.",
			},
		],
	]) {
		const report = structuredClone(auditReportFixture);
		if (documentDiagnostics !== undefined) {
			report.documentDiagnostics = documentDiagnostics as DocumentDiagnostic[];
		}
		assert.equal(validate(report), true, JSON.stringify(validate.errors));
	}
});

test("ca-010: diagnostics reject unsafe/noncanonical paths", () => {
	for (const path of [
		"",
		"/docs/a.md",
		"C:/docs/a.md",
		"C:docs/a.md",
		"docs\\a.md",
		"./docs/a.md",
		"../docs/a.md",
		"docs/../a.md",
		"docs/./a.md",
		"docs//a.md",
		"docs/",
		".",
		"..",
		"docs/..",
		"docs/a\0.md",
		"docs/line\n/../a.md",
		"docs/line\r/a\\b.md",
	]) {
		assert.equal(
			validate({
				...auditReportFixture,
				documentDiagnostics: [{ ...diagnostic, path }],
			}),
			false,
			JSON.stringify(path),
		);
	}
});

test("ca-010: diagnostics require all fields, stable codes, and nonblank messages; no claims/scores", () => {
	const invalid: unknown[] = [
		null,
		{ ...diagnostic, code: "broken" },
		{ ...diagnostic, message: "" },
		{ ...diagnostic, message: " \n\t" },
		{ ...diagnostic, score: 1 },
		{ ...diagnostic, claim: { kind: "path" } },
	];
	for (const key of ["path", "code", "message"] as const) {
		const missing: Partial<DocumentDiagnostic> = { ...diagnostic };
		delete missing[key];
		invalid.push(missing);
	}
	for (const entry of invalid) {
		assert.equal(
			validate({ ...auditReportFixture, documentDiagnostics: [entry] }),
			false,
			JSON.stringify(entry),
		);
	}
});

test("ca-010: canonicalization sorts all ties without mutation, claim changes, or scoring", () => {
	const sorted: DocumentDiagnostic[] = [
		{ ...diagnostic, message: "A: set owner." },
		{ ...diagnostic, message: "Z: set owner." },
		{ ...diagnostic, code: "unreadable_document" },
		{ ...diagnostic, path: "docs/z.md" },
	];
	const report: AuditReport = {
		...structuredClone(auditReportFixture),
		documentDiagnostics: [...sorted].reverse(),
	};
	const before = structuredClone(report);
	const canonical = canonicalizeReport(report);
	assert.deepEqual(canonical.documentDiagnostics, sorted);
	assert.deepEqual(report, before);
	assert.notEqual(canonical.documentDiagnostics?.[0], sorted[0]);
	assert.deepEqual(canonical, canonicalizeReport(canonical));
	assert.deepEqual(
		canonical.docFindings,
		canonicalizeReport(auditReportFixture).docFindings,
	);
	assert.deepEqual(
		canonical,
		canonicalizeReport({ ...report, documentDiagnostics: sorted }),
	);
	assert.equal(
		Object.hasOwn(
			canonicalizeReport(auditReportFixture),
			"documentDiagnostics",
		),
		false,
	);
	assert.deepEqual(
		canonicalizeReport({ ...report, documentDiagnostics: [] })
			.documentDiagnostics,
		[],
	);
});
