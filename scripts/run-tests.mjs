// Cross-platform test-file discovery for `npm test` (see package.json).
//
// `tsx --test` alone doesn't glob — its default file discovery finds zero
// tests on some machines. Shell-glob-expanding the pattern
// (`tsx --test tests/**/*.test.ts`) works on bash but not on Windows'
// cmd/PowerShell, which don't expand globs before invoking the process. So
// this script does the recursive walk itself (in plain Node, no shell
// dependency) and passes the resolved file list to `node --import tsx --test`.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const testsDir = path.join(repoRoot, "tests");

function walk(dir, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, out);
		} else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
			out.push(full);
		}
	}
}

const files = [];
walk(testsDir, files);
files.sort();

if (files.length === 0) {
	console.error(`No test files found under ${testsDir}`);
	process.exit(1);
}

const result = spawnSync(
	process.execPath,
	["--import", "tsx", "--test", ...files],
	{ cwd: repoRoot, stdio: "inherit" },
);

process.exit(result.status ?? 1);
