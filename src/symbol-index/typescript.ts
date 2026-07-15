/**
 * TypeScript/JavaScript `SymbolIndex` backend (design spec §5.1 `covers_apis`,
 * §8 Step 3; locked in `docs/STRATEGY-docspine.md` §2).
 *
 * This is a pure **parse-and-walk** index: every file is parsed with
 * `ts.createSourceFile` (the compiler's parser only) and the resulting AST is
 * walked directly with the real `ts.is*` type-guard functions. There is no
 * `ts.createProgram`, no type checker, and no module-resolution/tsconfig-
 * driven build — see `docs/PARCELS/w1-symbol-index-ts.md`'s Forbidden section
 * for why that's a hard line, not a style preference: this tool runs against
 * arbitrary target repos whose `tsconfig.json` may not even be resolvable
 * from where `docaudit` runs, a full `Program` is drastically slower and more
 * failure-prone across other people's repos, and we only need "does a
 * declaration with this name exist," never type information.
 *
 * What gets indexed (top-level only, plus one level of class/interface/enum
 * members dotted as `"Outer.member"`):
 *   - `function` declarations                        -> kind "function"
 *   - `class` declarations                            -> kind "class"
 *     - methods / get / set accessors                 -> kind "method"
 *     - properties                                    -> kind "property"
 *   - `interface` declarations                         -> kind "interface"
 *     - method signatures                             -> kind "method"
 *     - property signatures                           -> kind "property"
 *   - `type` aliases                                   -> kind "type"
 *   - `enum` declarations                              -> kind "enum"
 *     - members                                        -> kind "enum-member"
 *   - top-level `const`/`let`/`var` declarations with a simple identifier
 *     binding (never destructured — see below)          -> kind "const"
 *
 * Every declaration is indexed whether or not it is `export`ed: this index's
 * job is "does this identifier exist in source," not "is it part of the
 * public API" (a doc can legitimately reference an internal helper).
 *
 * Deliberately NOT indexed (documented scope lines, not oversights):
 *   - Destructured top-level bindings (`const { a, b } = foo()`,
 *     `const [a, b] = foo()`) — v1 only indexes simple identifier bindings.
 *   - Members with a computed property name (`[expr]() {}`) — no statically
 *     known name to index.
 *   - Anything nested inside a function/block body — only top-level
 *     declarations (plus one level of class/interface/enum members) are
 *     indexed; a helper declared inside another function is invisible to
 *     this index by design (the spec's "top-level" line).
 *
 * `has`/`lookup` do an EXACT-STRING match against the indexed name: a dotted
 * name like `"ClassName.memberName"` matches only that exact dotted form —
 * `lookup("memberName")` does NOT also match `"ClassName.memberName"`. That is
 * a deliberate scope line (see the parcel spec's Contract section item 5),
 * not an oversight.
 */
import { execFileSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import type { SymbolIndex, SymbolInfo } from "../contracts/plugins.js";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function toPosix(p: string): string {
	return p.split(path.sep).join("/");
}

function hasSourceExtension(p: string): boolean {
	return SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext));
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
		return; // unreadable directory -- skip defensively (spec's enumeration discipline)
	}
	for (const entry of entries) {
		if (entry.name === ".git" || entry.name === "node_modules") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFs(full, repoRoot, out);
		} else if (entry.isFile() && hasSourceExtension(entry.name)) {
			out.push(toPosix(path.relative(repoRoot, full)));
		}
	}
}

/**
 * Enumerates repo-root-relative POSIX paths (no leading "./") to every
 * `.ts`/`.tsx`/`.js`/`.jsx` file under `repoRoot`, sorted for determinism.
 * Same enumeration discipline as `src/pipeline/walk.ts` (`git ls-files` when
 * `repoRoot` is a git working tree, else a recursive filesystem walk, always
 * skipping `.git`/`node_modules`), scoped to source-code extensions instead
 * of `*.md` — a parallel implementation, not an import of `walk.ts`, since
 * that module is scoped to docs.
 */
function enumerateSourceFiles(repoRoot: string): string[] {
	if (isGitRepo(repoRoot)) {
		const out = execFileSync("git", ["ls-files", "-z"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		return out
			.split("\0")
			.filter((p) => p.length > 0 && hasSourceExtension(p))
			.map(toPosix)
			.sort();
	}

	const out: string[] = [];
	walkFs(repoRoot, repoRoot, out);
	return out.sort();
}

function scriptKindForExtension(filePath: string): ts.ScriptKind {
	if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
	return ts.ScriptKind.JS;
}

/**
 * Resolves a declaration/member name node to its static text, or `null` when
 * the name isn't statically known (a computed property name like `[expr]`).
 */
function getDeclaredNameText(name: ts.PropertyName | undefined): string | null {
	if (!name) return null;
	if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
	if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	return null; // ComputedPropertyName -- no statically known name, out of scope
}

/**
 * Walks one parsed source file's top-level statements (plus one level of
 * class/interface/enum members) and records every declaration found into
 * `index`, keyed by its exact (possibly dotted) name.
 */
function collectSymbols(
	relPath: string,
	sourceFile: ts.SourceFile,
	index: Map<string, SymbolInfo[]>,
): void {
	const record = (name: string, kind: string, nameNode: ts.Node): void => {
		const { line } = sourceFile.getLineAndCharacterOfPosition(
			nameNode.getStart(sourceFile),
		);
		const info: SymbolInfo = { name, path: relPath, line: line + 1, kind };
		const existing = index.get(name);
		if (existing) {
			existing.push(info);
		} else {
			index.set(name, [info]);
		}
	};

	for (const stmt of sourceFile.statements) {
		if (ts.isFunctionDeclaration(stmt)) {
			if (stmt.name) record(stmt.name.text, "function", stmt.name);
			continue;
		}

		if (ts.isClassDeclaration(stmt)) {
			if (!stmt.name) continue; // anonymous default-export class -- no name to index
			const className = stmt.name.text;
			record(className, "class", stmt.name);
			for (const member of stmt.members) {
				// Constructors are intentionally NOT indexed: `ts.ConstructorDeclaration`
				// has no `name` node (it's the literal `constructor` keyword), and the
				// spec's class-member categories are only "method"/"property".
				if (ts.isMethodDeclaration(member)) {
					const memberName = getDeclaredNameText(member.name);
					if (memberName) {
						record(`${className}.${memberName}`, "method", member.name);
					}
				} else if (ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
					const memberName = getDeclaredNameText(member.name);
					if (memberName) {
						record(`${className}.${memberName}`, "method", member.name);
					}
				} else if (ts.isPropertyDeclaration(member)) {
					const memberName = getDeclaredNameText(member.name);
					if (memberName) {
						record(`${className}.${memberName}`, "property", member.name);
					}
				}
			}
			continue;
		}

		if (ts.isInterfaceDeclaration(stmt)) {
			const interfaceName = stmt.name.text;
			record(interfaceName, "interface", stmt.name);
			for (const member of stmt.members) {
				if (ts.isMethodSignature(member)) {
					const memberName = getDeclaredNameText(member.name);
					if (memberName) {
						record(`${interfaceName}.${memberName}`, "method", member.name);
					}
				} else if (ts.isPropertySignature(member)) {
					const memberName = getDeclaredNameText(member.name);
					if (memberName) {
						record(`${interfaceName}.${memberName}`, "property", member.name);
					}
				}
			}
			continue;
		}

		if (ts.isTypeAliasDeclaration(stmt)) {
			record(stmt.name.text, "type", stmt.name);
			continue;
		}

		if (ts.isEnumDeclaration(stmt)) {
			const enumName = stmt.name.text;
			record(enumName, "enum", stmt.name);
			for (const member of stmt.members) {
				const memberName = getDeclaredNameText(member.name);
				if (memberName) {
					record(`${enumName}.${memberName}`, "enum-member", member.name);
				}
			}
			continue;
		}

		if (ts.isVariableStatement(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					record(decl.name.text, "const", decl.name);
				}
				// Destructured bindings (ObjectBindingPattern/ArrayBindingPattern) are
				// intentionally NOT indexed -- documented out-of-scope case (v1).
			}
		}
	}
}

/**
 * Builds a `SymbolIndex` for the TypeScript/JavaScript declarations found
 * under `repoRoot`. See this module's header for exactly what is and isn't
 * indexed.
 */
export function buildTypeScriptSymbolIndex(repoRoot: string): SymbolIndex {
	const files = enumerateSourceFiles(repoRoot);
	const index = new Map<string, SymbolInfo[]>();

	for (const relPath of files) {
		const absPath = path.join(repoRoot, relPath);
		let text: string;
		try {
			text = readFileSync(absPath, "utf8");
		} catch {
			continue; // unreadable file -- skip defensively, never crash the index build
		}
		const sourceFile = ts.createSourceFile(
			relPath,
			text,
			ts.ScriptTarget.Latest,
			/* setParentNodes */ true,
			scriptKindForExtension(relPath),
		);
		collectSymbols(relPath, sourceFile, index);
	}

	return {
		language: "typescript",
		has(symbol: string): boolean {
			return index.has(symbol);
		},
		lookup(symbol: string): SymbolInfo[] {
			return index.get(symbol) ?? [];
		},
	};
}
