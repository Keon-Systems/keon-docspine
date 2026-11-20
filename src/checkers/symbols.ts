/**
 * Symbol claim checker (design spec §8 Step 3; parcel spec
 * `docs/PARCELS/w1-check-symbols.md`). Consults `ctx.symbolIndex` to
 * classify each symbol claim as ok, broken, or unverifiable.
 *
 * Decision logic (in order):
 *   1. No index in ctx → "unverifiable" (unverifiable_no_index)
 *   2. index.has(symbol) → "ok" (symbol_exists:{name})
 *   3. Missing from TS/JS index, but word-boundary text scan finds it in a
 *      non-TS/JS source file → "unverifiable" (unverifiable_symbol_language)
 *   4. Not found anywhere → "broken" (symbol_not_found:{name})
 *
 * Case 3 exists to handle fixture defect #12 (format_report lives in a
 * Python file — neither ok nor broken from the TS-only index's perspective).
 * The scan is purely textual (no language parser), which is an accepted v1
 * imprecision: flagging as unverifiable is always safe.
 *
 * Efficiency: missing symbols are collected first, then all non-TS/JS files
 * are scanned in a single pass with an early exit once every missing symbol
 * has been found.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type {
	Checker,
	Claim,
	ClaimFinding,
	RepoContext,
} from "../contracts/index.js";

// Extensions the TS/JS index already covers — skip these in the foreign scan.
const TS_JS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

// Known programming language source extensions worth scanning for foreign
// symbols. Deliberately narrow: we want to detect symbols in OTHER language
// source files (e.g. Python), NOT in docs, configs, or data files (which
// can mention a symbol name in prose or a code fence and produce false
// "unverifiable_symbol_language" hits).
const FOREIGN_SOURCE_EXTS = new Set([
	".py",
	".rb",
	".go",
	".rs",
	".java",
	".cs",
	".php",
	".c",
	".cpp",
	".cc",
	".cxx",
	".h",
	".hpp",
	".hxx",
	".swift",
	".kt",
	".kts",
	".scala",
	".ex",
	".exs",
	".lua",
	".r",
	".pl",
	".pm",
	".sh",
	".bash",
	".zsh",
	".fish",
	".clj",
	".cljs",
	".elm",
	".hs",
	".erl",
	".ml",
	".mli",
]);

function isForeignSource(file: string): boolean {
	const ext = path.extname(file).toLowerCase();
	return FOREIGN_SOURCE_EXTS.has(ext) && !TS_JS_EXTS.has(ext);
}

function listForeignSourceFiles(root: string, isGitRepo: boolean): string[] {
	if (isGitRepo) {
		try {
			const out = execFileSync("git", ["ls-files", "-z"], {
				cwd: root,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			return out.split("\0").filter((l) => l.length > 0 && isForeignSource(l));
		} catch {
			// fall through to filesystem walk
		}
	}
	return walkForeignSource(root, root);
}

function walkForeignSource(root: string, dir: string): string[] {
	const results: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (entry === ".git" || entry === "node_modules") continue;
		const abs = path.join(dir, entry);
		let isDir: boolean;
		try {
			isDir = statSync(abs).isDirectory();
		} catch {
			continue;
		}
		if (isDir) {
			results.push(...walkForeignSource(root, abs));
		} else if (isForeignSource(entry)) {
			results.push(path.relative(root, abs).replace(/\\/g, "/"));
		}
	}
	return results;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scans non-TS/JS source files once and returns which of `targets` appear
 * in them via a word-boundary text match. Precompiles one RegExp per target
 * before walking files and short-circuits once all targets are found.
 */
function findForeignSymbols(
	targets: string[],
	root: string,
	isGitRepo: boolean,
): Set<string> {
	const found = new Set<string>();
	if (targets.length === 0) return found;

	const matchers = targets.map((sym) => ({
		sym,
		re: new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(sym)}(?![A-Za-z0-9_$])`),
	}));

	const files = listForeignSourceFiles(root, isGitRepo);
	for (const relPath of files) {
		let content: string;
		try {
			content = readFileSync(path.join(root, relPath), "utf8");
		} catch {
			continue;
		}
		for (const { sym, re } of matchers) {
			if (!found.has(sym) && re.test(content)) {
				found.add(sym);
			}
		}
		if (found.size === targets.length) break;
	}
	return found;
}

export const symbolChecker: Checker = {
	id: "check-symbols",
	kind: "symbol",

	async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> {
		if (!ctx.symbolIndex) {
			return claims.map((claim) => ({
				claim,
				status: "unverifiable" as const,
				detail: "unverifiable_no_index: no SymbolIndex was built for this run",
			}));
		}

		const index = ctx.symbolIndex;

		// Collect unique symbols absent from the TS/JS index for the foreign scan.
		const missingFromIndex: string[] = [];
		for (const claim of claims) {
			if (!index.has(claim.value) && !missingFromIndex.includes(claim.value)) {
				missingFromIndex.push(claim.value);
			}
		}

		const foreignFound = findForeignSymbols(
			missingFromIndex,
			ctx.root,
			ctx.git.isRepo,
		);

		return claims.map((claim) => {
			if (index.has(claim.value)) {
				return {
					claim,
					status: "ok" as const,
					detail: `symbol_exists:${claim.value}`,
				};
			}
			if (foreignFound.has(claim.value)) {
				return {
					claim,
					status: "unverifiable" as const,
					detail: "unverifiable_symbol_language",
				};
			}
			return {
				claim,
				status: "broken" as const,
				detail: `symbol_not_found:${claim.value}`,
			};
		});
	},
};
