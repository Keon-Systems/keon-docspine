/**
 * Full frontmatter validator: ajv-based schema validation against the
 * published `schemas/frontmatter.schema.json` (including the conditional
 * `covers`-required-for-canon/runbook rule, expressed in the schema itself
 * via if/then), producing actionable, human-readable error messages rather
 * than raw ajv error dumps.
 *
 * Standalone module — not wired into `src/pipeline/parse-doc.ts` or any
 * CLI. See the parcel spec's Forbidden/Out of Scope sections.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import matter from "gray-matter";
import type { DocFrontmatter } from "../contracts/index.js";

export interface FrontmatterValidationResult {
	/** Parsed YAML frontmatter data, present whenever a frontmatter block existed and parsed as YAML — regardless of whether it then passed schema validation. `null` only when no frontmatter block was found, or the block failed to parse as YAML at all. */
	data: Record<string, unknown> | null;
	/** Schema-valid `DocFrontmatter`, present if and only if `errors` is empty. */
	frontmatter: DocFrontmatter | null;
	/** Human-readable, actionable messages. Empty iff `frontmatter` is non-null. */
	errors: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(
	__dirname,
	"../../schemas/frontmatter.schema.json",
);

/**
 * One ajv instance, compiled once at module load — matches
 * `tests/contracts/schema-satisfaction.test.ts`'s `Ajv2020` setup
 * convention (`allErrors: true`), so every failing field is reported in one
 * pass rather than stopping at the first error.
 */
function buildValidator() {
	const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
	const ajv = new Ajv2020({ allErrors: true, strict: true });
	return ajv.compile(schema);
}

const validateSchema = buildValidator();

/** Resolves an ajv `instancePath` (e.g. `"/covers"`, `""`) to a dot-notation field label (e.g. `"covers"`, `"(root)"`). */
function fieldLabel(instancePath: string): string {
	if (!instancePath) {
		return "(root)";
	}
	return instancePath.slice(1).replaceAll("/", ".");
}

/** Reads the value at an ajv `instancePath` off the original data object, for inclusion in "(got ...)" messages. */
function valueAtPath(
	data: Record<string, unknown>,
	instancePath: string,
): unknown {
	const segments = instancePath.split("/").filter((s) => s.length > 0);
	let cursor: unknown = data;
	for (const segment of segments) {
		if (cursor === null || typeof cursor !== "object") {
			return undefined;
		}
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return cursor;
}

/**
 * Formats one ajv error into an actionable, human-readable message, e.g.
 * `"kind: must be one of canon, adr, runbook, map, reference, history,
 * scratch, guide (got \"cannon\")"`, `"owner: is required"`.
 *
 * Returns `null` for ajv's `if`-keyword errors: these are emitted alongside
 * the concrete `required`/`type`/etc. error the failing `then` branch
 * already produces (see the conditional `covers` rule), and stringifying
 * them too would just add a redundant "must match \"then\" schema" line
 * with no new information for a human fixing the doc.
 */
function formatAjvError(
	error: ErrorObject,
	data: Record<string, unknown>,
): string | null {
	const field = fieldLabel(error.instancePath);

	switch (error.keyword) {
		case "if":
			return null;
		case "required": {
			const missing = (error.params as { missingProperty: string })
				.missingProperty;
			return `${missing}: is required`;
		}
		case "enum": {
			const allowed = (
				error.params as { allowedValues: unknown[] }
			).allowedValues.join(", ");
			const got = valueAtPath(data, error.instancePath);
			return `${field}: must be one of ${allowed} (got ${JSON.stringify(got)})`;
		}
		case "type": {
			const expected = (error.params as { type: string }).type;
			const got = valueAtPath(data, error.instancePath);
			return `${field}: must be of type ${expected} (got ${JSON.stringify(got)})`;
		}
		case "minLength":
			return `${field}: must not be empty`;
		case "minItems": {
			const limit = (error.params as { limit: number }).limit;
			return `${field}: must have at least ${limit} item(s)`;
		}
		case "additionalProperties": {
			const extra = (error.params as { additionalProperty: string })
				.additionalProperty;
			return `${field}: unexpected additional property "${extra}"`;
		}
		default:
			return `${field}: ${error.message ?? "failed validation"}`;
	}
}

function formatAjvErrors(
	errors: ErrorObject[],
	data: Record<string, unknown>,
): string[] {
	const messages: string[] = [];
	for (const error of errors) {
		const message = formatAjvError(error, data);
		if (message !== null && !messages.includes(message)) {
			messages.push(message);
		}
	}
	return messages;
}

/**
 * Normalizes YAML's auto-boxing of unquoted date-like scalars (e.g.
 * `last_verified_at: 2026-06-01`) from native `Date` objects back into the
 * ISO-8601 date strings the schema (and `DocFrontmatter`) expect.
 *
 * js-yaml's default schema (which `gray-matter` uses, matching
 * `src/pipeline/parse-doc.ts`'s own plain `matter(raw)` call) implements
 * YAML core-schema timestamp resolution: an unquoted date-only scalar like
 * `2026-06-01` parses as a JS `Date`, not a string -- even though every
 * date-shaped `DocFrontmatter` field (`last_verified_at`, `expires`) is
 * typed `string | null`. Left unhandled, any doc that writes an unquoted
 * date -- the natural, unremarkable way to write YAML dates; see
 * `fixtures/messy-repo/docs/canon/valid-frontmatter.md`'s
 * `last_verified_at: 2026-06-01` -- would fail schema validation with a
 * spurious `must be of type string,null` error unrelated to the doc's
 * actual correctness. Shallow/top-level only: no `DocFrontmatter` field is
 * a nested object, so only top-level scalar values need inspecting.
 */
function normalizeYamlDates(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = { ...data };
	for (const [key, value] of Object.entries(normalized)) {
		if (value instanceof Date) {
			normalized[key] = value.toISOString().slice(0, 10);
		}
	}
	return normalized;
}

/**
 * Parses and schema-validates one doc's raw source text's frontmatter block
 * against `schemas/frontmatter.schema.json`.
 */
export function validateFrontmatter(
	rawDocText: string,
	docPath: string,
): FrontmatterValidationResult {
	let parsed: ReturnType<typeof matter>;
	try {
		parsed = matter(rawDocText);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		return {
			data: null,
			frontmatter: null,
			errors: [
				`${docPath}: frontmatter block failed to parse as YAML (${reason})`,
			],
		};
	}

	const hasFrontmatterBlock = parsed.matter.length > 0;
	if (!hasFrontmatterBlock) {
		return {
			data: null,
			frontmatter: null,
			errors: [`${docPath}: no frontmatter block found`],
		};
	}

	const data = normalizeYamlDates(
		(parsed.data ?? {}) as Record<string, unknown>,
	);
	const valid = validateSchema(data);

	if (valid) {
		return {
			data,
			frontmatter: data as unknown as DocFrontmatter,
			errors: [],
		};
	}

	return {
		data,
		frontmatter: null,
		errors: formatAjvErrors(validateSchema.errors ?? [], data),
	};
}
