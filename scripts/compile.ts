/** Temporary provider-free entrypoint; future CLI maps config to typed options. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compileManifest, serializeManifest } from "../src/manifest/compile.js";

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const check = args.includes("--check");
	const positional = args.filter((arg) => arg !== "--check");
	if (positional.length !== 1 || positional[0]?.startsWith("--")) {
		console.error("Usage: npx tsx scripts/compile.ts <repo-root> [--check]");
		process.exitCode = 1;
		return;
	}
	const root = path.resolve(positional[0] as string);
	const result = await compileManifest(root);
	for (const error of result.errors) console.error(error);
	let differs = false;
	const outputs = {
		"manifest.json": serializeManifest(result.manifest),
		"INDEX.md": result.indexMd,
	};
	if (!check) mkdirSync(path.join(root, "docs"), { recursive: true });
	for (const [name, content] of Object.entries(outputs)) {
		const target = path.join(root, "docs", name);
		if (check) {
			try {
				if (readFileSync(target, "utf8") === content) continue;
			} catch {}
			console.error(`${target}: missing or differs from fresh compile`);
			differs = true;
		} else writeFileSync(target, content, "utf8");
	}
	// Emit useful partial inventory on metadata errors, but never report success.
	if (differs || result.errors.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
