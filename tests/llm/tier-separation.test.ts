import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const llm = path.join(root, "src/llm");
const forbidden = ["frontmatter", "drift", "manifest", "pipeline"].map((dir) =>
	path.join(root, "src", dir),
);
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
assert.ok(configPath);
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(
	config.config,
	ts.sys,
	root,
).options;

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const name = path.join(dir, entry.name);
		return entry.isDirectory() ? files(name) : [name];
	});
}

/** Parse syntax, including re-exports, import types, require and dynamic import. */
function specifiers(file: string, source: string): string[] {
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const imports: string[] = [];
	const add = (specifier: ts.Node | undefined) => {
		assert.ok(
			specifier && ts.isStringLiteralLike(specifier),
			`${file}: non-static module dependency`,
		);
		imports.push(specifier.text);
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			if (node.moduleSpecifier) add(node.moduleSpecifier);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference)
		) {
			add(node.moduleReference.expression);
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument)
		) {
			add(node.argument.literal);
		} else if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require"))
		) {
			add(node.arguments[0]);
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return imports;
}

function violates(file: string, specifier: string): boolean {
	const resolved = ts.resolveModuleName(
		specifier,
		file,
		options,
		ts.sys,
	).resolvedModule;
	// Resolve missing relative modules too (a future drift/manifest directory
	// must not make the boundary pass just because it is not in this checkout).
	const target =
		resolved?.resolvedFileName ??
		(specifier.startsWith(".")
			? path.resolve(path.dirname(file), specifier)
			: undefined);
	assert.ok(
		target || specifier.startsWith("node:"),
		`${file}: unresolved dependency ${specifier}`,
	);
	return (
		target !== undefined &&
		forbidden.some(
			(dir) => target === dir || target.startsWith(`${dir}${path.sep}`),
		)
	);
}

test("all src/llm module dependencies stay outside status-writing directories", () => {
	const sources = files(llm).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
	assert.ok(
		sources.length >= 4,
		"the boundary must actually inspect production files",
	);
	for (const file of sources) {
		for (const specifier of specifiers(file, readFileSync(file, "utf8"))) {
			assert.equal(
				violates(file, specifier),
				false,
				`${path.relative(root, file)} imports ${specifier}`,
			);
		}
	}
});

test("boundary parser catches static/dynamic imports, type imports, require and re-exports", () => {
	const file = path.join(llm, "boundary-probe.ts");
	const imports = specifiers(
		file,
		`
		import type { X } from "../frontmatter/validate.js";
		export { y } from "../drift/compute.js";
		export * from "../manifest/compile.js";
		const a = import("../pipeline/run-verify.js");
		const b = require("../frontmatter/machine-fields.js");
		type C = import("../manifest/compile.js").C;
		import d = require("../drift/compute.js");
	`,
	);
	assert.equal(imports.length, 7);
	for (const specifier of imports)
		assert.equal(violates(file, specifier), true);
	assert.equal(violates(file, "../contracts/frontmatter.js"), false);
	assert.equal(violates(file, "./types.js"), false);
	assert.throws(
		() => specifiers(file, "const m = import(variable);"),
		/non-static/,
	);
});

test("src/llm never mentions DocStatus or writes documentation files", () => {
	for (const file of files(llm)) {
		const source = readFileSync(file, "utf8");
		assert.doesNotMatch(source, /\bDocStatus\b/, file);
		assert.doesNotMatch(
			source,
			/\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|rename(?:Sync)?|unlink(?:Sync)?)\b/,
			file,
		);
	}
});
