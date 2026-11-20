import path from "node:path";
import type { Manifest } from "../contracts/index.js";

function cell(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("|", "&#124;")
		.replaceAll("[", "&#91;")
		.replaceAll("]", "&#93;")
		.replaceAll("`", "&#96;")
		.replace(/[\r\n]/g, " ");
}

/** A human-readable view of the manifest, never a second metadata scan. */
export function renderIndexMd(manifest: Manifest): string {
	const ids = Object.keys(manifest.docs).sort();
	const lines = [
		"# Documentation Index",
		"",
		"<!-- Generated from manifest; do not edit. -->",
		"",
		`Commit: ${cell(manifest.generated_at_sha)}`,
		`Documents: ${ids.length}`,
		"",
		"| Doc | Kind | Status | Confidence | Tokens |",
		"| --- | --- | --- | --- | ---: |",
	];
	for (const id of ids) {
		const doc = manifest.docs[id];
		if (!doc) continue;
		const href = path.posix
			.relative("docs", doc.path)
			.split("/")
			.map(encodeURIComponent)
			.join("/");
		lines.push(
			`| [${cell(id)}](${href}) | ${doc.kind} | ${doc.status} | ${doc.confidence} | ${doc.tokens_estimate} |`,
		);
	}
	lines.push("", "## Context packets", "");
	for (const name of Object.keys(manifest.context_packets).sort())
		lines.push(
			`- ${cell(name)}: ${(manifest.context_packets[name] ?? []).map(cell).join(" → ")}`,
		);
	return `${lines.join("\n")}\n`;
}
