import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginsRoot = path.join(repositoryRoot, "plugins");

const hostRuntimeModules = new Set([
  "@getpaseo/plugin",
  "@getpaseo/plugin/react-native",
  "@getpaseo/plugin/server",
  "@tanstack/react-query",
  "react",
  "react/jsx-runtime",
  "react-native",
  "zod",
]);

const sharedModules = new Set(["@getpaseo/plugin", "zod"]);
const clientModules = new Set([
  ...sharedModules, "@getpaseo/plugin/client", "@getpaseo/plugin/client/react-native",
  "@getpaseo/plugin/client/ui", "@tanstack/react-query", "react", "react/jsx-runtime", "react-native",
]);
const serverModules = new Set([
  ...sharedModules, "@getpaseo/plugin/server", "@getpaseo/plugin/server/provider", "@getpaseo/plugin/server/acp",
]);

const nodeRuntimeModules = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`]),
);

const ignoredDirectoryNames = new Set(["node_modules", "test", "tests"]);
const ignoredFilePattern =
  /(?:\.d\.ts|\.(?:test|spec)\.[cm]?[jt]sx?|^vitest\.config\.[cm]?[jt]sx?)$/;
const sourceFilePattern = /\.[cm]?[jt]sx?$/;

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        files.push(...(await listSourceFiles(entryPath)));
      }
      continue;
    }

    if (
      entry.isFile() &&
      sourceFilePattern.test(entry.name) &&
      !ignoredFilePattern.test(entry.name)
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

export function collectImports(source, filename = "source.ts") {
  const imports = [];
  const add = (value, typeOnly = false) => imports.push({
    name: value && ts.isStringLiteralLike(value) ? value.text : null, typeOnly,
  });
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly || (!clause?.name && bindings &&
        ts.isNamedImports(bindings) && bindings.elements.length && bindings.elements.every((item) => item.isTypeOnly))));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause;
      add(node.moduleSpecifier, Boolean(node.isTypeOnly || (clause && ts.isNamedExports(clause) &&
        clause.elements.length && clause.elements.every((item) => item.isTypeOnly))));
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true));
  return imports;
}

function runtimeOwner(relative) {
  const normalized = relative.split(path.sep).join("/");
  if (/^index\.(client|server)\.tsx?$/.test(normalized)) return normalized.split(".")[1];
  const owner = normalized.split("/")[0];
  return ["client", "server", "shared"].includes(owner) ? owner : null;
}

export function importError({ name, typeOnly }, relative, version) {
  if (name === null) return "non-literal dynamic imports cannot be checked for Git-source availability";
  if (!/^0\.(8|9)\./.test(version)) {
    return typeOnly || name.startsWith(".") || hostRuntimeModules.has(name) || nodeRuntimeModules.has(name)
      ? null : `unavailable runtime module "${name}"`;
  }
  const owner = runtimeOwner(relative);
  if (!owner) return "source modules must be in client/, server/, or shared/";
  if (name.startsWith(".")) {
    const target = path.normalize(path.join(path.dirname(relative), name));
    const targetOwner = runtimeOwner(target);
    return targetOwner && (targetOwner === "shared" || targetOwner === owner)
      ? null : `${owner} import crosses runtime/directory boundary: "${name}"`;
  }
  const allowed = owner === "client" ? clientModules : owner === "server" ? serverModules : sharedModules;
  if (allowed.has(name)) return null;
  if (owner === "server" && nodeRuntimeModules.has(name)) return null;
  return `unavailable ${owner} ${typeOnly ? "type" : "runtime"} module "${name}"`;
}

async function main() {
  const pluginDirectories = (await readdir(pluginsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsRoot, entry.name));

  const failures = [];
  let checkedFileCount = 0;

  for (const pluginDirectory of pluginDirectories) {
    const manifestPath = path.join(pluginDirectory, "paseo-plugin.json");
    let manifest;
    let version;

    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const pkg = JSON.parse(await readFile(path.join(pluginDirectory, "package.json"), "utf8"));
      version = pkg.devDependencies?.["@getpaseo/plugin"];
      if (!/^0\.(7|8|9)\.\d+(?:-[a-z0-9.-]+)?$/.test(version ?? "")) throw new Error("Unsupported or non-exact plugin SDK version");
    } catch (error) {
      failures.push(`${path.relative(repositoryRoot, manifestPath)}: ${error.message}`);
      continue;
    }

    for (const sourceFile of await listSourceFiles(pluginDirectory)) {
      checkedFileCount += 1;
      const source = await readFile(sourceFile, "utf8");

      const relative = path.relative(pluginDirectory, sourceFile);
      if (/^0\.(8|9)\./.test(version) && !runtimeOwner(relative)) {
        failures.push(`${manifest.id}: ${relative}: source modules must be in client/, server/, or shared/`);
      }
      for (const imported of collectImports(source, sourceFile)) {
        const error = importError(imported, relative, version);
        if (error) {
          failures.push(
            `${manifest.id}: ${path.relative(repositoryRoot, sourceFile)}: ${error}`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error("Git-source runtime import check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Git-source runtime import check passed for ${pluginDirectories.length} plugins (${checkedFileCount} source files).`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
