import { readdirSync, readFileSync } from "node:fs";
import { matchesGlob, relative, resolve } from "node:path";
import ts from "typescript";

// Biome 2.5 has no allowTypeImports. Read its classifications rather than duplicate them.
const config = JSON.parse(readFileSync("biome.json", "utf8"));
function configError(message) {
  console.error(`biome.json: import-boundaries configuration: ${message}`);
  process.exit(1);
}

function findOverride(marker) {
  const found = config.overrides.filter((override) => override.includes?.includes(marker));
  if (found.length !== 1) {
    configError(`Expected exactly one override containing ${marker}; found ${found.length}.`);
  }
  return found.at(0);
}

function findPattern(override, message) {
  const found = override.linter?.rules?.style?.noRestrictedImports?.options?.patterns?.filter(
    (pattern) => pattern.message === message,
  );
  if (found?.length !== 1 || !Array.isArray(found.at(0).group)) {
    configError(`Expected exactly one restriction with a group and message: ${message}`);
  }
  return found.at(0).group;
}

const typeImportsOverride = findOverride("src/**/*.ts");
const appOverride = findOverride("src/components/**");
const sharedOverride = findOverride("src/*.ts");
const nodeOverride = findOverride("src/ports-host.ts");
const serverOverride = findOverride("src/server.ts");
const expectedOrder = [typeImportsOverride, appOverride, sharedOverride, nodeOverride, serverOverride];
const actualOrder = config.overrides.filter((override) => expectedOrder.includes(override));
if (actualOrder.some((override, index) => override !== expectedOrder.at(index))) {
  configError("Overrides must remain ordered: type imports, app, shared, Node, server.");
}
const appIncludes = appOverride.includes;
const sharedIncludes = sharedOverride.includes;
const sourceFiles = [
  "app.tsx",
  ...readdirSync("src", { recursive: true })
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => `src/${name}`),
];
const files = process.argv.length > 2 ? process.argv.slice(2) : sourceFiles;
const matches = (file, globs) =>
  globs.some((glob) => !glob.startsWith("!") && matchesGlob(file, glob)) &&
  !globs.some((glob) => glob.startsWith("!") && matchesGlob(file, glob.slice(1)));
let failures = 0;

// ESLint derived extensionless TSX names at runtime. Keep Biome's explicit list complete.
const tsxPatterns = [
  "**/*.tsx",
  ...new Set(
    sourceFiles
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => {
        const name = file.split("/").at(-1).slice(0, -4);
        return `**/${name}`;
      }),
  ),
].sort();
for (const override of [nodeOverride, serverOverride]) {
  const patterns = findPattern(override, "Node runtime modules must not import TSX app modules.");
  if (JSON.stringify([...patterns].sort()) !== JSON.stringify(tsxPatterns)) {
    console.error("biome.json: sync both Node TSX pattern lists with app.tsx and every src/**/*.tsx basename.");
    failures++;
  }
}

function report(file, source, node, message) {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  console.error(`${file}:${line + 1}:${character + 1}: import-boundaries: ${message}`);
  failures++;
}

function isTypeOnly(node) {
  if (node.isTypeOnly || node.importClause?.isTypeOnly) return true;
  const bindings = ts.isExportDeclaration(node) ? node.exportClause : node.importClause?.namedBindings;
  return (
    !node.importClause?.name &&
    bindings &&
    (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

for (const input of files) {
  const file = relative(process.cwd(), resolve(input)).replaceAll("\\", "/");
  if (!sourceFiles.includes(file)) continue;
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const browserOrShared = matches(file, appIncludes) || matches(file, sharedIncludes);
  function visit(node) {
    // Preserve consistent-type-imports' annotation ban, including its sole Vitest exception.
    if (ts.isImportTypeNode(node) && file !== "src/ports-host.test.ts") {
      report(file, source, node, "Use a top-level import type instead of an import() type annotation.");
    }
    if (browserOrShared && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier) && !isTypeOnly(node)) {
        const name = specifier.text;
        if (
          /(^|\/)(server|ports-host)(\.[cm]?[jt]sx?)?$/.test(name) ||
          name.startsWith("node:") ||
          name === "better-sqlite3" ||
          name.startsWith("better-sqlite3/")
        ) {
          report(file, source, specifier, `Browser/shared code may only import types from ${name}.`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures > 0) process.exitCode = 1;
else console.log("Import boundaries passed.");
