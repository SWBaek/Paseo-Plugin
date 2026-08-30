import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function collectRuntimeImports(source) {
  const imports = new Set();
  const withoutComments = stripComments(source);
  const staticImportPattern =
    /\b(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern =
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    for (const match of withoutComments.matchAll(pattern)) {
      imports.add(match[1]);
    }
  }

  return imports;
}

function isAvailableWithoutInstall(moduleName) {
  return (
    moduleName.startsWith(".") ||
    hostRuntimeModules.has(moduleName) ||
    nodeRuntimeModules.has(moduleName)
  );
}

const pluginDirectories = (await readdir(pluginsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(pluginsRoot, entry.name));

const failures = [];
let checkedFileCount = 0;

for (const pluginDirectory of pluginDirectories) {
  const manifestPath = path.join(pluginDirectory, "paseo-plugin.json");
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`${path.relative(repositoryRoot, manifestPath)}: ${error.message}`);
    continue;
  }

  for (const sourceFile of await listSourceFiles(pluginDirectory)) {
    checkedFileCount += 1;
    const source = await readFile(sourceFile, "utf8");

    for (const moduleName of collectRuntimeImports(source)) {
      if (!isAvailableWithoutInstall(moduleName)) {
        failures.push(
          `${manifest.id}: ${path.relative(repositoryRoot, sourceFile)} imports unavailable runtime module "${moduleName}"`,
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
