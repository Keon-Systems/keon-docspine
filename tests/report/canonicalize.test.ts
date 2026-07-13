/**
 * `canonicalizeReport` must produce array orderings that are stable and
 * insensitive to the input's original array order — see
 * `docs/PARCELS/w1-report-writer.md` Contract / Required Tests.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type {
	AuditReport,
	Claim,
	ClaimFinding,
	ContradictionCandidate,
	CoverageGap,
	DocFinding,
} from "../../src/contracts/index.js";
import { canonicalizeReport } from "../../src/report/canonicalize.js";

function claim(overrides: Partial<Claim> & Pick<Claim, "docId">): Claim {
	return {
		kind: "path",
		value: "src/a.ts",
		line: 1,
		raw: "`src/a.ts`",
		...overrides,
	};
}

function finding(
	overrides: Partial<ClaimFinding> & { claim: Claim },
): ClaimFinding {
	return {
		status: "ok",
		...overrides,
	};
}

function docFinding(docId: string, claimFindings: ClaimFinding[]): DocFinding {
	return {
		docId,
		claimFindings,
		score: { brokenClaimRatio: 0, coveredCodeChurn: 0, docAgeVsCodeAge: 0 },
	};
}

function gap(target: string): CoverageGap {
	return { target, targetKind: "code_root", churn: 1, fanIn: 1 };
}

function contradiction(docIds: [string, string]): ContradictionCandidate {
	return {
		docIds,
		claimA: `${docIds[0]} claim`,
		claimB: `${docIds[1]} claim`,
		classification: "contradictory",
	};
}

const baseReport: AuditReport = {
	generatedAtSha: "abc123",
	toolVersion: "0.1.0",
	analysisDepth: "full",
	docFindings: [
		docFinding("doc-a", [
			finding({ claim: claim({ docId: "doc-a", line: 3, kind: "path" }) }),
			finding({
				claim: claim({ docId: "doc-a", line: 1, kind: "symbol", value: "Foo" }),
			}),
			finding({
				claim: claim({
					docId: "doc-a",
					line: 1,
					kind: "command",
					value: "npm test",
				}),
			}),
		]),
		docFinding("doc-b", [
			finding({ claim: claim({ docId: "doc-b", line: 2 }) }),
		]),
	],
	gaps: [gap("src/x/"), gap("src/a/")],
	contradictions: [
		contradiction(["doc-a", "doc-b"]),
		contradiction(["doc-a", "doc-c"]),
	],
};

/** Same content as `baseReport`, but every array field shuffled/reversed. */
const shuffledReport: AuditReport = {
	generatedAtSha: "abc123",
	toolVersion: "0.1.0",
	analysisDepth: "full",
	docFindings: [
		docFinding("doc-b", [
			finding({ claim: claim({ docId: "doc-b", line: 2 }) }),
		]),
		docFinding("doc-a", [
			finding({
				claim: claim({
					docId: "doc-a",
					line: 1,
					kind: "command",
					value: "npm test",
				}),
			}),
			finding({ claim: claim({ docId: "doc-a", line: 3, kind: "path" }) }),
			finding({
				claim: claim({ docId: "doc-a", line: 1, kind: "symbol", value: "Foo" }),
			}),
		]),
	],
	gaps: [gap("src/a/"), gap("src/x/")],
	contradictions: [
		contradiction(["doc-a", "doc-c"]),
		contradiction(["doc-a", "doc-b"]),
	],
};

test("canonicalizeReport: differently-ordered-but-equivalent reports canonicalize to deepEqual results", () => {
	assert.deepEqual(
		canonicalizeReport(baseReport),
		canonicalizeReport(shuffledReport),
	);
});

test("canonicalizeReport: docFindings sorted by docId lexicographically", () => {
	const result = canonicalizeReport(shuffledReport);
	assert.deepEqual(
		result.docFindings.map((d) => d.docId),
		["doc-a", "doc-b"],
	);
});

test("canonicalizeReport: claimFindings sorted by (line, kind, value)", () => {
	const result = canonicalizeReport(shuffledReport);
	const docA = result.docFindings.find((d) => d.docId === "doc-a");
	assert.ok(docA);
	assert.deepEqual(
		docA.claimFindings.map((f) => [f.claim.line, f.claim.kind, f.claim.value]),
		[
			[1, "command", "npm test"],
			[1, "symbol", "Foo"],
			[3, "path", "src/a.ts"],
		],
	);
});

test("canonicalizeReport: gaps sorted by target lexicographically", () => {
	const result = canonicalizeReport(shuffledReport);
	assert.deepEqual(
		result.gaps.map((g) => g.target),
		["src/a/", "src/x/"],
	);
});

test("canonicalizeReport: contradictions sorted by joined docIds lexicographically", () => {
	const result = canonicalizeReport(shuffledReport);
	assert.deepEqual(
		result.contradictions.map((c) => c.docIds),
		[
			["doc-a", "doc-b"],
			["doc-a", "doc-c"],
		],
	);
});

test("canonicalizeReport: a report with a single entry in each array is a no-op", () => {
	const singleton: AuditReport = {
		generatedAtSha: "abc123",
		toolVersion: "0.1.0",
		analysisDepth: "full",
		docFindings: [
			docFinding("only-doc", [
				finding({ claim: claim({ docId: "only-doc", line: 1 }) }),
			]),
		],
		gaps: [gap("src/only/")],
		contradictions: [contradiction(["only-doc", "other-doc"])],
	};

	assert.deepEqual(canonicalizeReport(singleton), singleton);
});

test("canonicalizeReport: idempotent — canonicalizing twice equals canonicalizing once", () => {
	const once = canonicalizeReport(baseReport);
	const twice = canonicalizeReport(canonicalizeReport(baseReport));
	assert.deepEqual(once, twice);
});

test("canonicalizeReport: does not mutate its input (deep clone)", () => {
	const before = JSON.parse(JSON.stringify(baseReport));
	canonicalizeReport(baseReport);
	assert.deepEqual(baseReport, before);
});
