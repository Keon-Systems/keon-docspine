import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	type CompileManifestOptions,
	compileManifest,
	serializeManifest,
} from "./compile.js";
import { renderIndexMd } from "./index-md.js";
import { regularFile } from "./paths.js";

const manifestPath = "docs/manifest.json";
const indexPath = "docs/INDEX.md";

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function readArtifact(root: string, relative: string): string | undefined {
	try {
		return readFileSync(regularFile(root, relative), "utf8");
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
}

function validAnchor(
	root: string,
	anchor: unknown,
	head: string,
): anchor is string {
	if (anchor === head) return true;
	if (
		typeof anchor !== "string" ||
		!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(anchor)
	) {
		return false;
	}
	// No abbreviated IDs or refs. Fail closed on missing/shallow ancestry.
	const result = spawnSync(
		"git",
		["--no-replace-objects", "merge-base", "--is-ancestor", anchor, head],
		{
			cwd: root,
			stdio: "ignore",
			timeout: 5_000,
			env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
		},
	);
	return result.status === 0;
}

/** Read-only freshness test against fresh inputs, retaining the stored generation anchor. */
export async function checkManifestUpToDate(
	repoRoot: string,
	options?: CompileManifestOptions,
): Promise<{ upToDate: boolean; errors: string[] }> {
	const root = realpathSync(repoRoot);
	const { manifest, errors } = await compileManifest(root, options);
	if (errors.length) return { upToDate: false, errors };
	const json = readArtifact(root, manifestPath);
	const index = readArtifact(root, indexPath);
	if (json === undefined || index === undefined)
		return { upToDate: false, errors };
	let anchor: unknown;
	try {
		anchor = JSON.parse(json)?.generated_at_sha;
	} catch {
		return { upToDate: false, errors };
	}
	if (!validAnchor(root, anchor, manifest.generated_at_sha)) {
		return { upToDate: false, errors };
	}
	const expected = { ...manifest, generated_at_sha: anchor };
	return {
		upToDate:
			json === serializeManifest(expected) && index === renderIndexMd(expected),
		errors,
	};
}

/** Write each artifact via rename, never by opening a destination for writing. */
export async function writeManifestArtifacts(
	repoRoot: string,
	options?: CompileManifestOptions,
): Promise<Awaited<ReturnType<typeof compileManifest>>> {
	const root = realpathSync(repoRoot);
	const result = await compileManifest(root, options);
	const docs = path.join(root, "docs");
	mkdirSync(docs, { recursive: true });
	const jsonTarget = regularFile(root, manifestPath, true);
	const indexTarget = regularFile(root, indexPath, true);
	const staging = mkdtempSync(path.join(docs, ".docspine-compile-"));
	try {
		const json = path.join(staging, "manifest.json");
		const index = path.join(staging, "INDEX.md");
		writeFileSync(json, serializeManifest(result.manifest), { flag: "wx" });
		writeFileSync(index, result.indexMd, { flag: "wx" });
		renameSync(json, jsonTarget);
		renameSync(index, indexTarget);
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
	return result;
}
