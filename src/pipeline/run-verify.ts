/**
 * Pipeline orchestration (design spec §8 Steps 1-3, path-only spike slice):
 * walk -> parse-doc -> extract -> check -> report. Proves the
 * `Extractor`/`Checker`/`AuditReport` contracts end-to-end before the
 * Batch-2 parcels fork against them (`docs/PARCELS/w1-spike-verify-paths.md`).
 *
 * Determinism: `docFindings` sorted by `docId`, `claimFindings` within each
 * doc sorted by `line` — cheap to do now (STRATEGY §6, item 5 "Report and
 * manifest output is deterministic"). Full report-writer hardening (stable
 * content hashing, canonical key ordering across every field, byte-stable
 * output) is `w1-report-writer`'s job, not this spike's — see
 * `docs/PARCELS/index.md`. `gaps` and `contradictions` are always empty
 * here: those are design spec §8 Steps 5/7, out of this path-only slice's
 * scope entirely.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type {
	AuditReport,
	Checker,
	Claim,
	ClaimFinding,
	DocFinding,
	Extractor,
	GitFacts,
	RepoContext,
	SymbolIndex,
} from "../contracts/index.js";
import { parseDoc } from "./parse-doc.js";
import { walkDocs } from "./walk.js";

/**
 * Provisional registry shape (see `src/registry.ts` — PROVISIONAL, finalized
 * by `w1-registry-wiring`). Plain data: arrays of already-implemented
 * `Extractor`/`Checker` objects.
 */
export interface Registry {
	extractors: Extractor[];
	checkers: Checker[];
	/** When present, called once per run to build the SymbolIndex added to ctx. */
	symbolIndexBuilder?: (root: string) => SymbolIndex;
}

// Mirrors package.json's version. TODO(w1-report-writer): single source of
// truth for toolVersion instead of a duplicated literal.
const TOOL_VERSION = "0.1.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getGitFacts(root: string): GitFacts {
	try {
		execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd: root,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return { isRepo: false, headSha: null, repoRoot: null };
	}

	try {
		const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		const repoRootRaw = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return { isRepo: true, headSha, repoRoot: path.resolve(repoRootRaw) };
	} catch {
		// Inside a work tree but HEAD is unborn (no commits yet) — defensive;
		// never expected against the seeded fixture, which always has >=3
		// commits, but must never crash the run.
		return { isRepo: true, headSha: null, repoRoot: path.resolve(root) };
	}
}

/** Stable identity for a `Claim`, used to re-attach `Checker` findings to the claim that produced them without relying on object reference equality. */
function claimKey(c: Claim): string {
	return JSON.stringify([c.docId, c.kind, c.line, c.value, c.raw]);
}

let cachedValidator: ValidateFunction | undefined;
function getReportValidator(): ValidateFunction {
	if (cachedValidator) return cachedValidator;
	const schemasDir = path.resolve(__dirname, "../../schemas");
	const schema = JSON.parse(
		readFileSync(path.join(schemasDir, "report.schema.json"), "utf8"),
	);
	const ajv = new Ajv2020({ allErrors: true, strict: true });
	cachedValidator = ajv.compile(schema);
	return cachedValidator;
}

/**
 * Runs the deterministic verify pipeline against `repoRoot` using the given
 * `Registry`, and returns a schema-valid `AuditReport` (validated against
 * `schemas/report.schema.json` via ajv before returning — throws if the
 * assembled report is somehow not schema-valid, since that would mean this
 * pipeline itself violated the published contract).
 */
export async function runVerify(
	repoRoot: string,
	registry: Registry,
): Promise<AuditReport> {
	const absRoot = path.resolve(repoRoot);
	const git = getGitFacts(absRoot);
	const ctx: RepoContext = { root: absRoot, git };
	if (registry.symbolIndexBuilder) {
		ctx.symbolIndex = registry.symbolIndexBuilder(absRoot);
	}

	const docPaths = walkDocs(absRoot);
	const claimsByDoc = new Map<string, Claim[]>();

	for (const relPath of docPaths) {
		const raw = readFileSync(path.join(absRoot, relPath), "utf8");
		const { doc, bodyLineOffset } = parseDoc(relPath, raw);

		const claims: Claim[] = [];
		for (const extractor of registry.extractors) {
			for (const claim of extractor.extract(doc)) {
				claims.push({ ...claim, line: claim.line + bodyLineOffset });
			}
		}
		claimsByDoc.set(doc.id, claims);
	}

	const allClaims = [...claimsByDoc.values()].flat();
	const findingsByClaim = new Map<string, ClaimFinding>();

	for (const checker of registry.checkers) {
		const claimsForChecker = allClaims.filter((c) => c.kind === checker.kind);
		if (claimsForChecker.length === 0) continue;
		const findings = await checker.check(claimsForChecker, ctx);
		for (const finding of findings) {
			findingsByClaim.set(claimKey(finding.claim), finding);
		}
	}

	const docFindings: DocFinding[] = [];
	for (const [docId, claims] of claimsByDoc) {
		const claimFindings: ClaimFinding[] = claims.map(
			(claim) =>
				findingsByClaim.get(claimKey(claim)) ?? {
					claim,
					status: "unverifiable",
					detail:
						"unverifiable_no_checker_registered: no checker in the registry handles this claim kind",
				},
		);
		claimFindings.sort((a, b) => a.claim.line - b.claim.line);

		const total = claimFindings.length;
		const brokenCount = claimFindings.filter((f) => f.status !== "ok").length;

		docFindings.push({
			docId,
			claimFindings,
			score: {
				brokenClaimRatio: total === 0 ? 0 : brokenCount / total,
				// TODO(w1-git-plumbing / w1-report-writer): real churn needs the
				// diff-since-sha git-plumbing helpers, out of this spike's scope.
				coveredCodeChurn: 0,
				// TODO(w1-report-writer): needs a real doc-age-vs-code-churn
				// signal; not computed by this spike.
				docAgeVsCodeAge: 0,
			},
		});
	}
	docFindings.sort((a, b) =>
		a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0,
	);

	const report: AuditReport = {
		generatedAtSha: git.headSha ?? "no-git-repo",
		toolVersion: TOOL_VERSION,
		// TODO(w1-report-writer): real depth-ladder labels (design spec §20/§26)
		// land with the provider layer; this spike only ever runs T0 path
		// checks, so a fixed label is accurate for now.
		analysisDepth: "path-only-spike",
		docFindings,
		gaps: [],
		contradictions: [],
	};

	const validate = getReportValidator();
	if (!validate(report)) {
		throw new Error(
			`runVerify produced a report that fails schemas/report.schema.json: ${JSON.stringify(
				validate.errors,
			)}`,
		);
	}

	return report;
}
