import matter from "gray-matter";

/** Parse only unlabelled YAML blocks; document authors cannot select an engine. */
export function parseYamlFrontmatter(raw: string): {
	data: Record<string, unknown>;
	content: string;
	hasFrontmatter: boolean;
} {
	const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
	if (!text.startsWith("---") || text.startsWith("----")) {
		return { data: {}, content: raw, hasFrontmatter: false };
	}
	if (!/^---[ \t]*\r?\n/.test(text)) {
		throw new Error(
			"expected an unlabelled YAML opening delimiter on its own line",
		);
	}
	// Passing options also disables gray-matter's content-only cache.
	const parsed = matter(text, { language: "yaml" });
	return {
		data: parsed.data,
		content: parsed.content,
		hasFrontmatter: (parsed.matter?.length ?? 0) > 0,
	};
}
