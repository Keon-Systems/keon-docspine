#!/usr/bin/env node
/**
 * Cross-platform (Linux / macOS / Windows) fixture git-history seeder for
 * `fixtures/messy-repo/`. Zero external shell dependencies (no pwsh, no bash)
 * — pure Node `node:fs` + `git`.
 *
 * Copies `fixtures/messy-repo` (excluding any `.git`) to `<target>`, then
 * creates a 3-commit git history:
 *   1. Initial commit with `src/payments/processor.ts` (pre-rename state).
 *   2. `git mv src/payments/processor.ts src/payments/charge-processor.ts`
 *      (enables rename detection for fixture defect #2).
 *   3. Post-rename edit touching `src/payments/charge-processor.ts` (>= 3
 *      commits touching a covered path, for drift engine tests).
 *
 * Usage:
 *   node fixtures/messy-repo/setup-fixture-git.mjs <target-dir>
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function git(cwd, args) {
	execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

export function seedFixtureGitRepo(targetArg) {
	const sourceRoot = path.resolve(__dirname);
	const target = path.resolve(
		targetArg ??
			path.join(
				os.tmpdir(),
				`docspine-fixture-git-${randomBytes(4).toString("hex")}`,
			),
	);

	if (sourceRoot === target) {
		throw new Error(
			"Target must not be the checked-in fixture tree itself. Pass a separate target directory.",
		);
	}

	if (existsSync(target)) {
		rmSync(target, { recursive: true, force: true });
	}
	mkdirSync(target, { recursive: true });

	cpSync(sourceRoot, target, {
		recursive: true,
		filter: (src) => path.basename(src) !== ".git",
	});

	git(target, ["init", "-q", "-b", "main"]);
	git(target, ["config", "user.email", "fixture@docspine.invalid"]);
	git(target, ["config", "user.name", "DocSpine Fixture Seeder"]);

	const newPath = path.join(target, "src/payments/charge-processor.ts");
	const oldPath = path.join(target, "src/payments/processor.ts");

	if (!existsSync(newPath)) {
		throw new Error(`Expected fixture file not found: ${newPath}`);
	}

	// Commit 1: pre-rename state.
	renameSync(newPath, oldPath);
	git(target, ["add", "-A"]);
	git(target, [
		"commit",
		"-q",
		"-m",
		"Initial import of messy-repo fixture (pre-rename state)",
	]);

	// Commit 2: git mv -> charge-processor.ts (defect #2).
	git(target, [
		"mv",
		"src/payments/processor.ts",
		"src/payments/charge-processor.ts",
	]);
	git(target, [
		"commit",
		"-q",
		"-m",
		"Rename payments processor.ts -> charge-processor.ts",
	]);

	// Commit 3: post-rename edit touching src/payments/**.
	appendFileSync(
		newPath,
		"\n// fixture: post-rename null-check added\n",
		"utf8",
	);
	git(target, ["add", "src/payments/charge-processor.ts"]);
	git(target, ["commit", "-q", "-m", "Add null-check to processCharge"]);

	return target;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const targetArg = process.argv[2];
	const seeded = seedFixtureGitRepo(targetArg);
	console.log(`OK: fixture git history seeded at ${seeded}`);
}
