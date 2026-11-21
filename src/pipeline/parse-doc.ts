/**
 * Minimal frontmatter parse (design spec §5.1, deliberately narrow per this
 * parcel's scope): decides only whether a frontmatter block is present, and
 * derives `ParsedDoc.id` via the canonical fallback rule in
 * `contracts/plugins.ts` / `contracts/claims.ts`. Full frontmatter *schema*
 * validation (required fields, closed enums, the conditional `covers`
 * rule against `schemas/frontmatter.schema.json`) is `w1-frontmatter-validate`'s
 * job, not this spike's — see `docs/PARCELS/index.md`.
 */
import type { DocFrontmatter, ParsedDoc } from "../contracts/index.js";
import { parseYamlFrontmatter } from "../frontmatter/parse-yaml.js";

export interface ParseDocResult {
	doc: ParsedDoc;
	/**
	 * Lines consumed by the frontmatter delimiter block (0 when the doc has
	 * no frontmatter) before `doc.body`'s own first line.
	 *
	 * NOT part of the `ParsedDoc` contract — `plugins.ts` has no such field,
	 * and `Extractor.extract(doc: ParsedDoc)` only ever receives a
	 * `ParsedDoc`. This spike's pipeline-internal convention (not a contract
	 * change) is: extractors compute `Claim.line` relative to `doc.body`
	 * (1-indexed from its own first line, ignoring any stripped
	 * frontmatter); `run-verify.ts` then adds this offset to every claim
	 * before it leaves the pipeline, so everything downstream (checkers,
	 * the report) sees the canonical full-source-file line number the
	 * `Claim.line` JSDoc requires.
	 *
	 * Flagged as spike friction for the coordinator: this convention isn't
	 * written down anywhere a Batch-2 `Extractor` author (symbols,
	 * commands, links) would see it. Worth a follow-up — either documenting
	 * it on `Extractor.extract`'s JSDoc, or adding an explicit
	 * `ParsedDoc.bodyLineOffset` field — but not fixed here, since Allowed
	 * Files for this parcel excludes `src/contracts/**`.
	 */
	bodyLineOffset: number;
}

/**
 * Parses one doc's raw source text into a `ParsedDoc` plus the
 * pipeline-internal line offset described above.
 *
 * @param relPath repo-root-relative POSIX path (no leading "./") to this doc.
 * @param raw the doc's full raw source text, exactly as read from disk.
 */
export function parseDoc(relPath: string, raw: string): ParseDocResult {
	let data: Record<string, unknown> = {};
	let content = raw;
	let hasFrontmatterBlock = false;
	const frontmatterErrors: string[] = [];

	try {
		const parsed = parseYamlFrontmatter(raw);
		hasFrontmatterBlock = parsed.hasFrontmatter;
		data = parsed.data;
		content = parsed.content;
	} catch (err) {
		frontmatterErrors.push(
			`frontmatter YAML parse failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		hasFrontmatterBlock = raw.trimStart().startsWith("---");
		content = raw;
	}

	// MINIMAL parse per this parcel's scope: "valid frontmatter" here means
	// only "a present block that parsed as YAML", not schema-valid. Full
	// schema validation (and the null-on-schema-failure nuance documented on
	// `ParsedDoc.frontmatter`) is w1-frontmatter-validate's job.
	const frontmatter: DocFrontmatter | null =
		hasFrontmatterBlock && frontmatterErrors.length === 0
			? (data as unknown as DocFrontmatter)
			: null;

	const id =
		frontmatter &&
		typeof frontmatter.id === "string" &&
		frontmatter.id.length > 0
			? frontmatter.id
			: relPath;

	// `content` is always a tail-substring of `raw` (gray-matter only slices
	// from the front, never re-serializes the body), so this length-diff
	// recovers the frontmatter block's true character span regardless of
	// gray-matter's internal leading-newline-stripping behavior.
	const offsetChars = Math.max(0, raw.length - content.length);
	const prefix = raw.slice(0, offsetChars);
	const bodyLineOffset = (prefix.match(/\n/g) ?? []).length;

	const doc: ParsedDoc = {
		id,
		path: relPath,
		frontmatter,
		frontmatterErrors,
		body: content,
	};

	return { doc, bodyLineOffset };
}
