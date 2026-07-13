/**
 * Command claim extractor (design spec §8 Step 2; `docs/PARCELS/w1-extract-commands.md`).
 * Pure function of `ParsedDoc` — no filesystem or network access, and no
 * command execution of any kind, ever, per `Extractor`'s contract.
 *
 * This is the inverse of `paths.ts`/`symbols.ts`: those mask fenced code
 * blocks *out* before scanning; this extractor is the one thing that reads
 * *inside* them. Only fenced blocks (``` ... ```) whose info string is a
 * shell language or blank (`bash`, `sh`, `shell`, `console`, or none) are
 * scanned — a fence naming a non-shell language (e.g. ```ts, ```json) is
 * source-code-sample territory, not a command claim. Inline single-backtick
 * spans are never command claims, regardless of content.
 *
 * Within an in-scope fenced block, one claim is produced per non-empty,
 * non-comment line (`#`-prefixed after trim). `npm run <script>` and bare
 * `npm test` lines produce a claim whose `value` is the script name alone
 * (matching `w1-check-commands`'s `package.json` `scripts` key convention);
 * any other line still produces a claim so a checker can mark it
 * `unverifiable` rather than the extractor silently dropping it — for those,
 * `value` is the trimmed raw line text, unmodified.
 */
import type { Claim, Extractor, ParsedDoc } from "../contracts/index.js";

/** A line that is only a fence delimiter: ``` optionally followed by an info string. */
const FENCE_LINE_RE = /^```\s*([^\s`]*)\s*$/;
/** Shell-language info strings (or blank) that put a fence in scope for this extractor. */
const SHELL_INFO_STRINGS = new Set(["", "bash", "sh", "shell", "console"]);
const NPM_RUN_RE = /^npm run (\S+)/;
const NPM_TEST_RE = /^npm test$/;

export const commandExtractor: Extractor = {
	id: "extract-commands",
	kind: "command",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];
		const lines = doc.body.split("\n");

		let inFence = false;
		let fenceIsShell = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			// Relative to doc.body; the pipeline adds the frontmatter offset
			// (see paths.ts's reference implementation of this convention)
			// before a claim leaves the pipeline.
			const lineNo = i + 1;

			const fenceMatch = line.match(FENCE_LINE_RE);
			if (fenceMatch) {
				if (!inFence) {
					inFence = true;
					const info = (fenceMatch[1] ?? "").toLowerCase();
					fenceIsShell = SHELL_INFO_STRINGS.has(info);
				} else {
					inFence = false;
					fenceIsShell = false;
				}
				continue;
			}

			if (!inFence || !fenceIsShell) continue;

			const trimmed = line.trim();
			if (!trimmed) continue; // empty line, skip
			if (trimmed.startsWith("#")) continue; // shell comment, skip

			const npmRunMatch = trimmed.match(NPM_RUN_RE);
			let value: string;
			if (npmRunMatch?.[1]) {
				value = npmRunMatch[1];
			} else if (NPM_TEST_RE.test(trimmed)) {
				value = "test";
			} else {
				value = trimmed;
			}

			claims.push({
				kind: "command",
				value,
				docId: doc.id,
				line: lineNo,
				raw: line,
			});
		}

		return claims;
	},
};
