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

/** A line that is only a fence delimiter: 3+ backticks or tildes, optionally indented (e.g. under a list item). */
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
/** Shell-language info strings (or blank) that put a fence in scope for this extractor. */
const SHELL_INFO_STRINGS = new Set(["", "bash", "sh", "shell", "console"]);
/** Optional leading shell prompt (`$ `) before a command inside a fenced block. */
const SHELL_PROMPT_RE = /^\$\s+/;
const NPM_RUN_RE = /^npm run (\S+)/;
const NPM_TEST_RE = /^npm test(?:\s+--(?:\s+.*)?)?$/;
const NPM_START_RE = /^npm start(?:\s+--(?:\s+.*)?)?$/;
const PNPM_RUN_RE = /^pnpm run (\S+)/;
const YARN_RUN_RE = /^yarn run (\S+)/;
const BUN_RUN_RE = /^bun run (\S+)/;

export const commandExtractor: Extractor = {
	id: "extract-commands",
	kind: "command",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];
		const lines = doc.body.split("\n");

		let fenceChar: "`" | "~" | null = null;
		let fenceLen = 0;
		let fenceIsShell = false;

		for (let i = 0; i < lines.length; i++) {
			const rawLine = lines[i] ?? "";
			const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
			// Relative to doc.body; the pipeline adds the frontmatter offset
			// (see paths.ts's reference implementation of this convention)
			// before a claim leaves the pipeline.
			const lineNo = i + 1;

			if (fenceChar === null) {
				const fenceMatch = line.match(FENCE_OPEN_RE);
				if (fenceMatch?.[1]) {
					const marker = fenceMatch[1];
					const info = (fenceMatch[2] ?? "").toLowerCase();
					fenceChar = marker[0] as "`" | "~";
					fenceLen = marker.length;
					fenceIsShell = SHELL_INFO_STRINGS.has(info);
					continue;
				}
				continue;
			}

			const trimmedLine = line.trim();
			if (
				trimmedLine.startsWith(fenceChar.repeat(fenceLen)) &&
				trimmedLine.slice(fenceLen).replaceAll(fenceChar, "").trim() === ""
			) {
				fenceChar = null;
				fenceLen = 0;
				fenceIsShell = false;
				continue;
			}

			if (!fenceIsShell) continue;

			const trimmed = trimmedLine;
			if (!trimmed) continue; // empty line, skip
			if (trimmed.startsWith("#")) continue; // shell comment, skip

			const normalized = trimmed.replace(SHELL_PROMPT_RE, "");
			const scriptRunMatch =
				normalized.match(NPM_RUN_RE) ??
				normalized.match(PNPM_RUN_RE) ??
				normalized.match(YARN_RUN_RE) ??
				normalized.match(BUN_RUN_RE);

			let value: string;
			if (scriptRunMatch?.[1]) {
				value = scriptRunMatch[1];
			} else if (NPM_TEST_RE.test(normalized)) {
				value = "test";
			} else if (NPM_START_RE.test(normalized)) {
				value = "start";
			} else {
				value = normalized;
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
