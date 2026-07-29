/**
 * Doc enumeration (design spec §8 Step 1, path-only spike slice). Pure
 * filesystem/git enumeration — no parsing, no claim extraction. When
 * `repoRoot` is a git working tree, uses `git ls-files` so `.gitignore`'d
 * and otherwise-untracked files are excluded (STRATEGY §2's locked
 * toolchain expectation); otherwise falls back to a plain recursive
 * filesystem walk (skipping `.git/` and `node_modules/` defensively).
 */
import { execFileSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

function toPosix(p: string): string {
	return p.split(path.sep).join("/");
}

function isGitRepo(repoRoot: string): boolean {
	try {
		execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd: repoRoot,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

function walkFs(dir: string, repoRoot: string, out: string[]): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // unreadable directory -- skip defensively (same discipline as symbol-index/typescript.ts)
	}
	for (const entry of entries) {
		if (entry.name === ".git" || entry.name === "node_modules") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFs(full, repoRoot, out);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			out.push(toPosix(path.relative(repoRoot, full)));
		}
	}
}

/**
 * Enumerates repo-root-relative POSIX paths (no leading "./") to every
 * `*.md` doc under `repoRoot`, sorted for determinism (STRATEGY §6 item 5:
 * stable ordering is cheap to do now).
 */
export function walkDocs(repoRoot: string): string[] {
	if (isGitRepo(repoRoot)) {
		const out = execFileSync("git", ["ls-files", "-z"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		return out
			.split("\0")
			.filter((p) => p.length > 0 && p.endsWith(".md"))
			.map(toPosix)
			.sort();
	}

	const out: string[] = [];
	walkFs(repoRoot, repoRoot, out);
	return out.sort();
}
