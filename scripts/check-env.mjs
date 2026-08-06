#!/usr/bin/env node
/**
 * Preinstall environment guard.
 *
 * Why this exists: DocSpine's build, lint, and test toolchain (typescript, tsx,
 * biome) lives in devDependencies. When `NODE_ENV=production` is set in the
 * shell, npm silently sets `omit=dev` and installs ONLY runtime deps. The
 * install "succeeds", then every test fails with an opaque
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`.
 *
 * That is a silent-failure class we refuse to ship: the tool that exists to
 * detect stale claims should not itself have an install path that lies about
 * succeeding. So the check is mechanical, not a README sentence someone has to
 * remember (design spec P4/P8).
 *
 * Zero dependencies by design — this runs before node_modules exists.
 *
 * Deliberate production install: set DOCSPINE_ALLOW_PROD_INSTALL=1.
 */

const ESCAPE_HATCH = "DOCSPINE_ALLOW_PROD_INSTALL";
const MIN_NODE_MAJOR = 22;

const problems = [];

/**
 * Normalize an env var before comparing. `set X=production && cmd` in cmd.exe
 * assigns "production " WITH a trailing space, so an exact-match check silently
 * misses the exact footgun this guard exists to catch.
 */
const envEquals = (name, expected) =>
	(process.env[name] ?? "").trim().toLowerCase() === expected;

if ((process.env[ESCAPE_HATCH] ?? "").trim() !== "1") {
	if (envEquals("NODE_ENV", "production")) {
		problems.push(
			[
				"NODE_ENV=production is set.",
				"  npm derives omit=dev from this and will skip typescript, tsx, and biome,",
				"  leaving an install that appears to succeed but cannot build, lint, or test.",
				"  Fix (pick one):",
				"    PowerShell : $env:NODE_ENV=''; npm install",
				"    cmd        : set NODE_ENV=& npm install",
				"    bash       : NODE_ENV= npm install",
				`  Deliberate production install: set ${ESCAPE_HATCH}=1`,
			].join("\n"),
		);
	}

	const omit = process.env.npm_config_omit ?? "";
	if (omit.includes("dev")) {
		problems.push(
			[
				`npm config omit includes "dev" (omit="${omit}").`,
				"  devDependencies carry the entire verification toolchain; omitting them",
				"  produces an unbuildable, untestable tree.",
				`  Deliberate production install: set ${ESCAPE_HATCH}=1`,
			].join("\n"),
		);
	}
}

const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
	problems.push(
		[
			`Node ${process.versions.node} detected; DocSpine requires >= ${MIN_NODE_MAJOR}.`,
			"  Node 20's test runner does not discover .ts test files, so the suite",
			"  silently collects zero tests instead of failing (amendment ca-002).",
			`  Fix: nvm use ${MIN_NODE_MAJOR}`,
		].join("\n"),
	);
}

if (problems.length > 0) {
	console.error("\nDocSpine preinstall check failed:\n");
	for (const p of problems) console.error(`  - ${p}\n`);
	process.exit(1);
}
