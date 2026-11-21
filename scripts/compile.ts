/** Temporary provider-free entrypoint; future CLI maps config to typed options. */
import {
	checkManifestUpToDate,
	writeManifestArtifacts,
} from "../src/manifest/artifacts.js";

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const check = args.includes("--check");
	const positional = args.filter((arg) => arg !== "--check");
	const root = positional[0];
	if (positional.length !== 1 || !root || root.startsWith("--")) {
		console.error("Usage: npx tsx scripts/compile.ts <repo-root> [--check]");
		process.exitCode = 1;
		return;
	}
	if (check) {
		const result = await checkManifestUpToDate(root);
		for (const error of result.errors) console.error(error);
		if (!result.upToDate) {
			console.error("Manifest or INDEX missing or differs from fresh compile");
			process.exitCode = 1;
		}
	} else {
		const result = await writeManifestArtifacts(root);
		for (const error of result.errors) console.error(error);
		// Emit useful partial inventory on metadata errors, but never report success.
		if (result.errors.length) process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
