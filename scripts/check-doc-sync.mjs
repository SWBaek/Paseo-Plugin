import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const pluginRoot = path.join(repositoryRoot, "plugins");
const errors = [];

function section(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) {
    errors.push(`Missing section: ${marker}`);
    return "";
  }
  const next = markdown.indexOf("\n## ", start + marker.length);
  return markdown.slice(start, next < 0 ? undefined : next);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function expectSet(label, actualValues, expectedValues) {
  const actual = uniqueSorted(actualValues);
  const expected = uniqueSorted(expectedValues);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label}: expected [${expected.join(", ")}], found [${actual.join(", ")}]`);
  }
}

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

const pluginDirectories = (await readdir(pluginRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const plugins = [];
for (const directory of pluginDirectories) {
  const manifestPath = path.join(pluginRoot, directory, "paseo-plugin.json");
  const packagePath = path.join(pluginRoot, directory, "package.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    if (!/^[a-z][a-z0-9-]*$/.test(manifest.id ?? "")) {
      errors.push(`${directory}: invalid or missing manifest id`);
    }
    if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
      errors.push(`${directory}: invalid or missing package name`);
    }
    plugins.push({ directory, id: manifest.id, packageName: packageJson.name });
  } catch (error) {
    errors.push(`${directory}: cannot read manifest/package (${error.message})`);
  }
}

if (new Set(plugins.map((plugin) => plugin.id)).size !== plugins.length) {
  errors.push("Runtime IDs must be unique.");
}
if (new Set(plugins.map((plugin) => plugin.packageName)).size !== plugins.length) {
  errors.push("Package names must be unique.");
}

const expectedDirectories = plugins.map((plugin) => plugin.directory);
const expectedIds = plugins.map((plugin) => plugin.id);
const readme = await readRepositoryFile("README.md");
const agents = await readRepositoryFile("AGENTS.md");
const gitInstallation = await readRepositoryFile("docs/GIT_INSTALLATION.md");

const workspaceMap = section(agents, "Workspace Map");
expectSet(
  "AGENTS.md Workspace Map",
  [...workspaceMap.matchAll(/^- `plugins\/([^/`]+)\/`/gm)].map((match) => match[1]),
  expectedDirectories,
);

const includedPlugins = section(readme, "포함된 플러그인");
const readmePluginRows = [...includedPlugins.matchAll(/\[`([^`]+)`\]\(plugins\/([^/)]+)\/\)/g)];
expectSet("README runtime IDs", readmePluginRows.map((match) => match[1]), expectedIds);
expectSet("README plugin links", readmePluginRows.map((match) => match[2]), expectedDirectories);
for (const [, id, directory] of readmePluginRows) {
  const plugin = plugins.find((entry) => entry.directory === directory);
  if (plugin && plugin.id !== id) {
    errors.push(`README maps plugins/${directory} to ${id}, but its manifest id is ${plugin.id}.`);
  }
}

const repositoryStructure = section(readme, "저장소 구조");
const pluginBlockStart = repositoryStructure.indexOf("├── plugins/");
const pluginBlockEnd = repositoryStructure.indexOf("├── docs/", pluginBlockStart);
const pluginTree = repositoryStructure.slice(pluginBlockStart, pluginBlockEnd);
expectSet(
  "README repository tree",
  [...pluginTree.matchAll(/│\s+[├└]── ([^/]+)\//g)].map((match) => match[1]),
  expectedDirectories,
);

expectSet(
  "README directory-install examples",
  [...readme.matchAll(/paseo plugin install .*"plugins\\([^"\\]+)"/g)].map((match) => match[1]),
  expectedDirectories,
);
expectSet(
  "README Git-install examples",
  [...readme.matchAll(/paseo plugin add \S+:plugins\/([a-z0-9-]+)/g)].map((match) => match[1]),
  expectedDirectories,
);
expectSet(
  "GIT_INSTALLATION.md install examples",
  [...gitInstallation.matchAll(/paseo plugin add \S+:plugins\/([a-z0-9-]+)/g)].map((match) => match[1]),
  expectedDirectories,
);

for (const template of [
  ".github/ISSUE_TEMPLATE/01-idea.yml",
  ".github/ISSUE_TEMPLATE/02-development-plan.yml",
  ".github/ISSUE_TEMPLATE/03-bug.yml",
]) {
  const yaml = await readRepositoryFile(template);
  const targetStart = yaml.indexOf("    id: target");
  const targetEnd = yaml.indexOf("\n  - type:", targetStart + 1);
  const targetBlock = yaml.slice(targetStart, targetEnd < 0 ? undefined : targetEnd);
  const options = [...targetBlock.matchAll(/^ {8}- (.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((option) => option !== "workspace 전체" && option !== "새 플러그인");
  expectSet(`${template} target options`, options, expectedIds);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(absolutePath)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolutePath);
  }
  return files;
}

const markdown = await markdownFiles(repositoryRoot);
for (const file of markdown) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    try {
      await access(resolved);
    } catch {
      errors.push(`${path.relative(repositoryRoot, file)}: missing link target ${match[1]}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Documentation sync check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation sync check passed for ${plugins.length} plugins and ${markdown.length} Markdown files.`,
  );
}
