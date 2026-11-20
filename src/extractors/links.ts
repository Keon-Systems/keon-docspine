/**
 * Link (anchor) claim extractor (design spec §8 Step 2; parcel
 * `w1-extract-links`). Pure function of `ParsedDoc` — no filesystem or
 * network access, per `Extractor`'s contract.
 *
 * This is the complementary half of `src/extractors/paths.ts`'s
 * `resolveLinkTarget`: that function already splits a markdown link target
 * on "#" and extracts the *path* portion (when non-empty) as a `path`
 * claim, ignoring the anchor. This extractor does the opposite — it looks
 * at the *anchor* portion of that same `[text](target)` syntax and, when
 * present, emits a `link`-kind claim for it. A link like
 * `[Rollback](payments.md#rollback-procedure)` legitimately produces two
 * claims from two different extractors (a `path` claim for
 * `payments.md` and a `link` claim for `payments.md#rollback-procedure`)
 * — that's intentional, not a duplicate.
 *
 * Two shapes of `target` produce a claim here:
 *
 *   1. Self-anchor — target is `#section` (nothing before the `#`).
 *      `Claim.value` is `<doc.path>#<anchor>` — the current doc's own
 *      repo-root-relative POSIX path, joined to the anchor exactly as
 *      written (no slugify/lowercase here — that's the checker's job).
 *   2. Cross-doc anchor — target is `otherfile.md#section` (or a relative
 *      path to one). `Claim.value` is `<resolved-repo-relative-path>#<anchor>`,
 *      resolved against `doc.path` using the exact same relative-resolution
 *      rule as `paths.ts`'s `resolveLinkTarget` (resolve relative to the
 *      directory of `doc.path`, strip a leading "/", no leading "./").
 *
 * Targets with no `#` fragment at all produce zero claims here (pure
 * `paths.ts` territory — see that file's `resolveLinkTarget`). External
 * (`scheme://`) URLs and `mailto:` links produce zero claims (design spec
 * §21 — external liveness isn't a T0 concern in v1). Bare anchor-looking
 * prose with no markdown link syntax is NOT extracted — only real
 * `[text](target)` syntax counts.
 */
import path from "node:path";
import type { Claim, Extractor, ParsedDoc } from "../contracts/index.js";
import { maskFencedCodeBlocks } from "./fences.js";

const MD_LINK_RE = /\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function toRepoRelativePosix(p: string): string {
	let out = p.split("\\").join("/");
	while (out.startsWith("./")) out = out.slice(2);
	if (out.startsWith("/")) out = out.slice(1);
	return out;
}

/**
 * Splits a markdown link target into its path and anchor halves and
 * resolves the path half exactly the way `paths.ts`'s `resolveLinkTarget`
 * does, returning the combined `<path>#<anchor>` claim value — or `null`
 * when the target isn't an in-scope anchor link (no fragment, external
 * URL, or `mailto:`).
 */
function resolveLinkAnchor(docPath: string, target: string): string | null {
	const t = target.trim();
	if (!t) return null;

	const hashIndex = t.indexOf("#");
	if (hashIndex === -1) return null; // no fragment at all — paths.ts territory

	const pathPart = t.slice(0, hashIndex);
	const anchor = t.slice(hashIndex + 1);
	if (!anchor) return null; // "(foo.md#)" — nothing to check

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathPart)) return null; // scheme:// URL
	if (pathPart.startsWith("mailto:")) return null;

	const resolvedPath = pathPart
		? pathPart.startsWith("/")
			? pathPart.slice(1)
			: path.posix.normalize(
					path.posix.join(path.posix.dirname(docPath), pathPart),
				)
		: toRepoRelativePosix(docPath); // self-anchor: "#section"

	return `${toRepoRelativePosix(resolvedPath)}#${anchor}`;
}

export const linkExtractor: Extractor = {
	id: "extract-links",
	kind: "link",

	extract(doc: ParsedDoc): Claim[] {
		const claims: Claim[] = [];

		// Mask fenced code blocks to same-length whitespace (preserves line
		// structure) before scanning — mirrors paths.ts, so a markdown link
		// quoted inside a fenced code sample is never extracted as a real
		// link claim.
		const maskedBody = maskFencedCodeBlocks(doc.body);
		const lines = maskedBody.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			// Relative to doc.body; run-verify.ts adds the frontmatter offset
			// (see parse-doc.ts's ParseDocResult.bodyLineOffset) before a claim
			// leaves the pipeline.
			const lineNo = i + 1;

			for (const m of line.matchAll(MD_LINK_RE)) {
				const target = m[1];
				if (!target) continue;
				const value = resolveLinkAnchor(doc.path, target);
				if (value) {
					claims.push({
						kind: "link",
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
