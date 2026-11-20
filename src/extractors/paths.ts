/**
 * Path claim extractor (design spec §8 Step 2, path-only spike slice).
 * Pure function of `ParsedDoc` — no filesystem or network access, per
 * `Extractor`'s contract. Recognizes three sources of `kind:"path"` claims,
 * per the `Claim.value` normalization rule in `contracts/claims.ts`:
 *
 *   1. Relative Markdown links whose target resolves to an in-repo file
 *      (anchor-only links like `(#section)` are `kind:"link"` territory,
 *      not ours — see `w1-extract-links`).
 *   2. Backtick-fenced spans that look like a path (contain "/" and end in
 *      a `name.ext` segment) — this excludes backticked symbols like
 *      `` `getInvoicePdf()` `` (no "/") and bare identifiers.
 *   3. The same path-shaped token appearing bare in prose (no backticks,
 *      no link syntax).
 *
 * Content inside fenced code blocks (``` ... ```) is masked out entirely
 * before scanning: that's command-extraction territory (`w1-extract-commands`).
 * Whether a bare path-looking token *inside* a fence should also produce a
 * path claim is a product decision this spike does not resolve — none of
 * the fixture repo's fenced blocks contain path-like tokens, so it never
 * came up in practice. Flagged to the coordinator rather than guessed at.
 */
import path from "node:path";
import type { Claim, Extractor, ParsedDoc } from "../contracts/index.js";
import { maskFencedCodeBlocks } from "./fences.js";

const INLINE_CODE_RE = /`([^`\n]+)`/g;
const MD_LINK_RE = /\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi;
/** Minimum-3-char run of path-safe characters; validated by `normalizeCandidate`. */
const BARE_TOKEN_RE = /[A-Za-z0-9_.\-/]{3,}/g;

function blank(line: string, start: number, length: number): string {
	return `${line.slice(0, start)}${" ".repeat(length)}${line.slice(start + length)}`;
}

function toRepoRelativePosix(p: string): string {
	let out = p.split("\\").join("/");
	while (out.startsWith("./")) out = out.slice(2);
	if (out.startsWith("/")) out = out.slice(1);
	return out;
}

/**
 * Normalizes a bare candidate token (from a backtick span or plain prose)
 * into a repo-root-relative POSIX path claim value, or returns `null` when
 * the token doesn't look like a path. See `tests/extractors/paths.test.ts`
 * for the precision cases this heuristic guards against (backticked
 * symbols, bare identifiers, shell commands, URLs).
 */
function normalizeCandidate(candidateRaw: string): string | null {
	let t = candidateRaw.trim();
	if (!t) return null;
	t = t.replace(/[).,:;!?]+$/, "");
	if (!t) return null;
	if (t.startsWith("#")) return null; // pure anchor, not a path
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null; // scheme:// URL
	if (t.startsWith("//")) return null; // protocol-relative URL
	if (t.startsWith("mailto:")) return null;
	if (!t.includes("/")) return null;
	const lastSegment = t.slice(t.lastIndexOf("/") + 1);
	// Allows dotfiles (.github/workflows/ci.yml) and multi-dot filenames
	// (foo.test.ts, report.schema.json, types.d.ts) while still requiring a
	// real filename.ext shape so prose ratios like "v1/v2" are rejected.
	if (!/^\.?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(lastSegment)) {
		return null;
	}
	return toRepoRelativePosix(t);
}

/**
 * Resolves a markdown link's `(target)` against the doc's own path (the
 * `Claim.value` rule: "relative Markdown links are resolved against
 * `ParsedDoc.path` before normalization"). Returns `null` for pure-anchor
 * links (`(#section)`), external URLs, and `mailto:` links — none of those
 * are path claims.
 */
function resolveLinkTarget(docPath: string, target: string): string | null {
	const t = target.trim();
	if (!t) return null;
	const [pathPart] = t.split("#");
	if (!pathPart) return null;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathPart)) return null;
	if (pathPart.startsWith("mailto:")) return null;
	const resolved = pathPart.startsWith("/")
		? pathPart.slice(1)
		: path.posix.normalize(
				path.posix.join(path.posix.dirname(docPath), pathPart),
			);
	return toRepoRelativePosix(resolved);
}

export const pathExtractor: Extractor = {
	id: "extract-paths",
	kind: "path",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];

		// Mask fenced code blocks to same-length whitespace (preserves line
		// structure) before scanning — see file header for why.
		const maskedBody = maskFencedCodeBlocks(doc.body);
		const lines = maskedBody.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			// Relative to doc.body; run-verify.ts adds the frontmatter offset
			// (see parse-doc.ts's ParseDocResult.bodyLineOffset) before a claim
			// leaves the pipeline.
			const lineNo = i + 1;

			let scrubLine = line;

			for (const m of line.matchAll(MD_LINK_RE)) {
				const target = m[1];
				const start = m.index ?? 0;
				if (target) {
					const value = resolveLinkTarget(doc.path, target);
					if (value) {
						claims.push({
							kind: "path",
							value,
							docId: doc.id,
							line: lineNo,
							raw: m[0],
						});
					}
				}
				scrubLine = blank(scrubLine, start, m[0].length);
			}

			for (const m of line.matchAll(INLINE_CODE_RE)) {
				const start = m.index ?? 0;
				const inner = m[1] ?? "";
				const value = normalizeCandidate(inner);
				if (value) {
					claims.push({
						kind: "path",
						value,
						docId: doc.id,
						line: lineNo,
						raw: m[0],
					});
				}
				scrubLine = blank(scrubLine, start, m[0].length);
			}

			scrubLine = scrubLine.replace(URL_RE, (u) => " ".repeat(u.length));

			for (const m of scrubLine.matchAll(BARE_TOKEN_RE)) {
				const value = normalizeCandidate(m[0]);
				if (value) {
					claims.push({
						kind: "path",
						value,
						docId: doc.id,
						line: lineNo,
						raw: m[0],
					});
				}
			}
		}

		return claims;
	},
};
