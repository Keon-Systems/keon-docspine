import { lstatSync } from "node:fs";
import path from "node:path";

/** Join only normal POSIX path components under an already-resolved root. */
export function regularFile(
	root: string,
	relative: string,
	allowMissingLeaf = false,
): string {
	const parts = relative.split("/");
	if (parts.some((p) => !p || p === "." || p === ".." || /[\\:]/.test(p))) {
		throw new Error(`unsafe repository path: ${relative}`);
	}
	let current = root;
	for (const [i, part] of parts.entries()) {
		current = path.join(current, part);
		const leaf = i === parts.length - 1;
		const info = lstatSync(current, {
			throwIfNoEntry: !(leaf && allowMissingLeaf),
		});
		if (!info) return current;
		if (leaf ? !info?.isFile() : !info?.isDirectory()) {
			throw new Error(
				`expected a regular file and real directories: ${relative}`,
			);
		}
	}
	return current;
}
