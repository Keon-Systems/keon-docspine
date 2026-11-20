/**
 * Command claim checker (design spec §8 Step 3, "package.json script
 * existence" case). Parcel spec `docs/PARCELS/w1-check-commands.md`.
 *
 * Verification mechanism is deliberately inert: read `<ctx.root>/package.json`
 * once per `check()` call, `JSON.parse` it, and look script names up in its
 * `scripts` object. This checker never executes, spawns, or shells out to
 * anything — not the claimed command, not `--help`, not anything (design
 * spec §8 Step 3: "dry-run/allowlist smoke tests... never arbitrary
 * execution"). No `child_process` import appears anywhere in this file.
 *
 * Shape detection re-derives the invocation form from `claim.raw` (not
 * `claim.value` alone) via regex, per this parcel's Contract section — this
 * decouples the checker from the extractor's exact internal `value`
 * convention, matching the parcel-boundary discipline shared with
 * `docs/PARCELS/w1-extract-commands.md`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
	Checker,
	Claim,
	ClaimFinding,
	RepoContext,
} from "../contracts/index.js";

// Leading whitespace and optional `$ ` prompt tolerated: the sibling extractor
// (w1-extract-commands) derives Claim.value from the trimmed line (minus any
// leading `$ ` prompt) while preserving the raw line in Claim.raw.
const SCRIPT_RUN_RE = /^\s*(?:\$\s+)?(?:npm|pnpm|yarn|bun) run (\S+)/;
const NPM_TEST_RE = /^\s*(?:\$\s+)?npm test(?:\s+--(?:\s+.*)?)?\s*$/;
const NPM_START_RE = /^\s*(?:\$\s+)?npm start(?:\s+--(?:\s+.*)?)?\s*$/;

/**
 * Reads and parses `<root>/package.json`'s `scripts` object. Returns `null`
 * on any failure (missing file, unreadable, invalid JSON, non-object
 * `scripts` field) — never throws, per this checker's "never crash" contract.
 */
function readScripts(root: string): Record<string, unknown> | null {
	let raw: string;
	try {
		raw = readFileSync(path.join(root, "package.json"), "utf8");
	} catch {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null) {
		return null;
	}

	const scripts = (parsed as Record<string, unknown>).scripts;
	if (typeof scripts !== "object" || scripts === null) {
		return null;
	}

	return scripts as Record<string, unknown>;
}

function checkScript(
	claim: Claim,
	scripts: Record<string, unknown>,
	name: string,
): ClaimFinding {
	if (Object.hasOwn(scripts, name)) {
		return { claim, status: "ok", detail: `npm_script_exists:${name}` };
	}
	return { claim, status: "broken", detail: `npm_script_not_found:${name}` };
}

export const commandChecker: Checker = {
	id: "check-commands",
	kind: "command",

	async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> {
		const scripts = readScripts(ctx.root);

		return claims.map((claim) => {
			if (!scripts) {
				return {
					claim,
					status: "unverifiable",
					detail: "unverifiable_no_package_json",
				};
			}

			const runMatch = SCRIPT_RUN_RE.exec(claim.raw);
			if (runMatch?.[1]) {
				return checkScript(claim, scripts, runMatch[1]);
			}

			if (NPM_TEST_RE.test(claim.raw)) {
				return checkScript(claim, scripts, "test");
			}

			if (NPM_START_RE.test(claim.raw)) {
				return checkScript(claim, scripts, "start");
			}

			return {
				claim,
				status: "unverifiable",
				detail:
					"unverifiable_command_shape: only npm/pnpm/yarn/bun run <script>, npm test, and npm start forms are checked in v1",
			};
		});
	},
};
