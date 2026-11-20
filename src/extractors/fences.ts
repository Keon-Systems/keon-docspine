/**
 * Shared, line-oriented Markdown fenced-code-block masking helper.
 *
 * Replaces every line inside a CommonMark-style fenced code block (3+ leading
 * backticks ```` ``` ```` or tildes `~~~`, with optional leading indentation
 * such as inside list items) with same-length spaces, preserving exact `\n`
 * count so downstream line numbers remain 1-indexed against `doc.body`.
 *
 * Unlike a naive `/```[\s\S]*?```/g` regex, this handles:
 *   - 4+ backtick fences wrapping nested 3-backtick fences (common in docs
 *     that document Markdown examples)
 *   - tilde fences (`~~~`)
 *   - list-indented fences (`  ```bash`)
 *   - inline triple-backtick spans (never mistaken for a fence delimiter)
 *   - unclosed fences at EOF (masked cleanly through EOF)
 */
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})([^`]*)$/;

export function maskFencedCodeBlocks(source: string): string {
	const lines = source.split("\n");
	let fenceChar: "`" | "~" | null = null;
	let fenceLen = 0;

	const out = new Array<string>(lines.length);

	for (let i = 0; i < lines.length; i++) {
		const rawLine = lines[i] ?? "";
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		const trailingCr = rawLine.endsWith("\r") ? "\r" : "";

		if (fenceChar === null) {
			const open = FENCE_OPEN_RE.exec(line);
			if (open?.[1]) {
				const marker = open[1];
				const info = open[2] ?? "";
				// Backtick info strings may not contain backticks (CommonMark §4.5).
				if (marker[0] === "`" && info.includes("`")) {
					out[i] = rawLine;
					continue;
				}
				fenceChar = marker[0] as "`" | "~";
				fenceLen = marker.length;
				out[i] = `${" ".repeat(line.length)}${trailingCr}`;
				continue;
			}
			out[i] = rawLine;
		} else {
			out[i] = `${" ".repeat(line.length)}${trailingCr}`;
			const trimmed = line.replace(/^ {0,3}/, "");
			if (
				trimmed.startsWith(fenceChar.repeat(fenceLen)) &&
				trimmed.slice(fenceLen).trim().replaceAll(fenceChar, "") === ""
			) {
				fenceChar = null;
				fenceLen = 0;
			}
		}
	}

	return out.join("\n");
}
