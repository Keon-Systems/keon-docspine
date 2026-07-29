/**
 * Link claim checker (design spec §8 Step 3; parcel spec
 * `docs/PARCELS/w1-check-links.md`).
 *
 * A `link`-kind `Claim.value` is `<repo-relative-target-path>#<anchor-as-written>`
 * (see `docs/PARCELS/w1-extract-links.md`, the sibling extractor parcel's
 * spec): self-anchor links use the source doc's own path as the path half,
 * cross-doc anchor links use the resolved target doc's path. This checker:
 *
 *   1. Splits `claim.value` on the LAST "#" into `targetPath`/`anchor`. A
 *      path can legitimately contain no "#" elsewhere in this system's
 *      normalization (repo-relative POSIX paths never carry a literal "#"),
 *      but splitting on the last occurrence is the safe, defensive rule
 *      regardless — it can never mis-split a value that has more than one
 *      "#" the way splitting on the first one could.
 *   2. Resolves `targetPath` against `ctx.root` and checks existence
 *      (`existsSync`, same convention as `src/checkers/paths.ts`). Missing
 *      -> "broken" / "link_target_missing".
 *   3. If present, reads the target file's raw text, extracts ATX headings
 *      (`#`..`######` followed by a space; setext-style `===`/`---`
 *      headings are out of scope for v1 per the parcel spec), and slugifies
 *      each with a GitHub-flavored-markdown-compatible algorithm.
 *   4. Case-insensitively matches the claimed anchor against every heading's
 *      slug -> "ok" / "anchor_exists:<anchor>", else "broken" /
 *      "anchor_not_found:<anchor>".
 *   5. Never crashes on an unreadable target file (permissions, binary
 *      content, etc.) -> "unverifiable" / "unverifiable_link_target_unreadable".
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
	Checker,
	Claim,
	ClaimFinding,
	RepoContext,
} from "../contracts/index.js";

const ATX_HEADING_RE = /^#{1,6} +(.*)$/;

/**
 * GitHub-flavored-markdown-compatible heading slugifier: lowercase, strip
 * characters that aren't letters/digits/spaces/hyphens, collapse whitespace
 * runs to single hyphens, trim leading/trailing hyphens.
 *
 * This intentionally does NOT implement GitHub's full disambiguation rule
 * (appending `-1`, `-2`, ... to repeated identical headings in the same
 * doc) — out of scope for v1; every fixture heading actually present in
 * `fixtures/messy-repo/docs/**` is unique per doc, so first-match-wins
 * (equivalent to no disambiguation) is correct for every case this checker
 * is exercised against.
 */
export function slugify(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^\p{L}\p{N} -]/gu, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Extracts ATX heading text (the content after the leading `#` run and
 * space) from a markdown document's raw source, one entry per heading line
 * encountered, in document order.
 */
function extractAtxHeadings(source: string): string[] {
	const headings: string[] = [];
	for (const line of source.split("\n")) {
		const match = ATX_HEADING_RE.exec(line.trimEnd());
		if (match?.[1] !== undefined) {
			headings.push(match[1]);
		}
	}
	return headings;
}

/** Splits a `link` claim's value on the LAST "#" — see file header. */
function splitTargetAndAnchor(value: string): {
	targetPath: string;
	anchor: string;
} {
	const idx = value.lastIndexOf("#");
	if (idx === -1) {
		// Contract-defined shape always has a "#"; defensively treat the
		// whole value as the path with an empty anchor rather than crash.
		return { targetPath: value, anchor: "" };
	}
	return { targetPath: value.slice(0, idx), anchor: value.slice(idx + 1) };
}

/**
 * Docs are untrusted data (per `AGENTS.md`'s prompt-injection posture): a
 * claim value containing `../` segments must never be followed outside
 * `root` and verified against the host filesystem, since that would let a
 * doc claim to "prove" the existence of an arbitrary file elsewhere on disk.
 * Same guard as `src/checkers/paths.ts`'s `isWithinRoot`.
 */
function isWithinRoot(root: string, abs: string): boolean {
	const rel = path.relative(root, abs);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Decodes a percent-encoded anchor (e.g. `caf%C3%A9-notes`, which GitHub
 * resolves to `café-notes` before slugifying) so encoded and literal anchors
 * compare equal. Falls back to the raw anchor on a malformed escape sequence
 * rather than throwing.
 */
function decodeAnchor(anchor: string): string {
	try {
		return decodeURIComponent(anchor);
	} catch {
		return anchor;
	}
}

export const linkChecker: Checker = {
	id: "check-links",
	kind: "link",

	async check(claims: Claim[], ctx: RepoContext): Promise<ClaimFinding[]> {
		return claims.map((claim) => {
			const { targetPath, anchor } = splitTargetAndAnchor(claim.value);
			const abs = path.join(ctx.root, targetPath);

			if (!isWithinRoot(ctx.root, abs)) {
				return { claim, status: "broken", detail: "path_escapes_repo_root" };
			}

			if (!existsSync(abs)) {
				return { claim, status: "broken", detail: "link_target_missing" };
			}

			let source: string;
			try {
				source = readFileSync(abs, "utf8");
			} catch {
				return {
					claim,
					status: "unverifiable",
					detail: "unverifiable_link_target_unreadable",
				};
			}

			const anchorLower = decodeAnchor(anchor).toLowerCase();
			const slugs = extractAtxHeadings(source).map(slugify);
			if (slugs.some((slug) => slug === anchorLower)) {
				return { claim, status: "ok", detail: `anchor_exists:${anchor}` };
			}

			return { claim, status: "broken", detail: `anchor_not_found:${anchor}` };
		});
	},
};
