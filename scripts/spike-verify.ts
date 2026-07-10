/**
 * Bare entry point (no CLI framework — commander wiring is `w2-cli-wiring`,
 * see `docs/PARCELS/w1-spike-verify-paths.md` Forbidden list):
 *
 *   npx tsx scripts/spike-verify.ts <repo-root>
 *
 * Runs the path-only verify pipeline against `<repo-root>`, writes a
 * schema-valid `AuditReport` to `<repo-root>/.docaudit/reports/audit-<sha>.json`
 * (design spec §8 "Output"), and prints a human-readable summary.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runVerify } from "../src/pipeline/run-verify.js";
import { registry } from "../src/registry.js";

async function main(): Promise<void> {
	const repoRootArg = process.argv[2];
	if (!repoRootArg) {
		console.error("Usage: npx tsx scripts/spike-verify.ts <repo-root>");
		process.exitCode = 1;
		return;
	}

	const repoRoot = path.resolve(repoRootArg);
	const report = await runVerify(repoRoot, registry);

	const outDir = path.join(repoRoot, ".docaudit", "reports");
	mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, `audit-${report.generatedAtSha}.json`);
	writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	const allFindings = report.docFindings.flatMap((d) => d.claimFindings);
	const counts = { ok: 0, broken: 0, moved: 0, unverifiable: 0 };
	for (const f of allFindings) counts[f.status]++;

	console.log("DocSpine spike-verify (path claims only)");
	console.log(`repo:   ${repoRoot}`);
	console.log(`sha:    ${report.generatedAtSha}`);
	console.log(`docs:   ${report.docFindings.length}`);
	console.log(`claims: ${allFindings.length}`);
	console.log(
		`ok=${counts.ok} broken=${counts.broken} moved=${counts.moved} unverifiable=${counts.unverifiable}`,
	);
	console.log(`report: ${outFile}`);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exitCode = 1;
});
