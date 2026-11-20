/**
 * `hashReport` must be order-insensitive to every array field and
 * key-insertion-order-insensitive, and sensitive to any actual content
 * change — see `docs/PARCELS/w1-report-writer.md` Contract / Required Tests
 * / Acceptance Criteria.
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
import { hashReport } from "../../src/report/hash.js";
import { stableStringify } from "../../src/report/serialize.js";

test("shared serializer preserves recursive keys and explicit array order", () => {
	const value = JSON.parse(
		'{"z":[{"z":1,"a":2},"b","a"],"__proto__":{"z":3,"a":4},"a":null}',
	);
	assert.equal(
		stableStringify(value),
		'{"__proto__":{"a":4,"z":3},"a":null,"z":[{"a":2,"z":1},"b","a"]}',
	);
	assert.deepEqual(JSON.parse(stableStringify(value)), value);
});

test("report hash remains byte-compatible with pre-extraction implementation", () => {
	assert.equal(
		hashReport({
			generatedAtSha: "abc123",
			toolVersion: "0.1.0",
			analysisDepth: "t0-only",
			docFindings: [],
			gaps: [],
			contradictions: [],
		}),
		"73ece936d04c16c1b3ce7673e268ac1f72354ec078855be9c6c1af14cfb0b63e",
	);
});

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
				claim: claim({ docId: "doc-a", line: 1, kind: "symbol", value: "Foo" }),
			}),
			finding({ claim: claim({ docId: "doc-a", line: 3, kind: "path" }) }),
		]),
	],
	gaps: [gap("src/a/"), gap("src/x/")],
	contradictions: [
		contradiction(["doc-a", "doc-c"]),
		contradiction(["doc-a", "doc-b"]),
	],
};

test("hashReport: differently-ordered-but-equivalent reports hash identically", () => {
	assert.equal(hashReport(baseReport), hashReport(shuffledReport));
});

test("hashReport: reports differing in exactly one ClaimFinding.status hash differently", () => {
	const changed: AuditReport = {
		...baseReport,
		docFindings: baseReport.docFindings.map((df, i) =>
			i === 0
				? {
						...df,
						claimFindings: df.claimFindings.map((f, j) =>
							j === 0 ? { ...f, status: "broken" } : f,
						),
					}
				: df,
		),
	};

	assert.notEqual(hashReport(baseReport), hashReport(changed));
});

test("hashReport: reports differing only in key-insertion-order hash identically", () => {
	// Build the same claim/finding/docFinding/report via two different
	// property-assignment orders (top-level and nested).
	const claimForward: Claim = {
		kind: "path",
		value: "src/only.ts",
		docId: "only-doc",
		line: 5,
		raw: "`src/only.ts`",
	};
	const claimReversed: Claim = {
		raw: "`src/only.ts`",
		line: 5,
		docId: "only-doc",
		value: "src/only.ts",
		kind: "path",
	};

	const findingForward: ClaimFinding = { claim: claimForward, status: "ok" };
	const findingReversed: ClaimFinding = {
		status: "ok",
		claim: claimReversed,
	};

	const docFindingForward: DocFinding = {
		docId: "only-doc",
		claimFindings: [findingForward],
		score: { brokenClaimRatio: 0, coveredCodeChurn: 0, docAgeVsCodeAge: 0 },
	};
	const docFindingReversed: DocFinding = {
		score: { docAgeVsCodeAge: 0, coveredCodeChurn: 0, brokenClaimRatio: 0 },
		claimFindings: [findingReversed],
		docId: "only-doc",
	};

	const reportForward: AuditReport = {
		generatedAtSha: "abc123",
		toolVersion: "0.1.0",
		analysisDepth: "full",
		docFindings: [docFindingForward],
		gaps: [],
		contradictions: [],
	};
	const reportReversed: AuditReport = {
		contradictions: [],
		gaps: [],
		docFindings: [docFindingReversed],
		analysisDepth: "full",
		toolVersion: "0.1.0",
		generatedAtSha: "abc123",
	};

	assert.equal(hashReport(reportForward), hashReport(reportReversed));
});
