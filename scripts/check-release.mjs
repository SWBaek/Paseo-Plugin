import { readFile, readdir, access } from "node:fs/promises";
import { validatePaseoMetadata, validateRuntimeEntries } from "./release-paseo.mjs";

const root = new URL("../", import.meta.url);
const json = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
const workspace = await json("package.json");
const catalog = await json("plugins.json");
const lock = await json("package-lock.json");
const errors = [];
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(workspace.version) || workspace.version === "0.0.0") errors.push("Set a release version.");
if (workspace.license !== "MIT") errors.push("Root license must match LICENSE.");
if (catalog.schemaVersion !== 1 || catalog.version !== workspace.version) errors.push("Catalog schema/version mismatch.");
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${workspace.version}`) errors.push("Release tag must match package/catalog version.");
const directories = (await readdir(new URL("plugins/", root), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const lockedPlugins = Object.keys(lock.packages ?? {}).filter((name) => /^plugins\/[^/]+$/.test(name)).sort();
if (JSON.stringify(lockedPlugins) !== JSON.stringify(directories.map((name) => `plugins/${name}`))) errors.push("Lockfile must contain exactly the current plugin workspaces.");
if (lock.version !== workspace.version || lock.packages?.[""]?.version !== workspace.version) errors.push("Lockfile collection version mismatch.");
if (JSON.stringify(catalog.plugins.map((entry) => entry.path).sort()) !== JSON.stringify(directories.map((name) => `plugins/${name}`))) errors.push("Catalog must contain exactly one entry per plugin directory.");
if (new Set(catalog.plugins.map((entry) => entry.id)).size !== directories.length) errors.push("Catalog IDs must be unique.");
for (const directory of directories) {
  const pkg = await json(`plugins/${directory}/package.json`);
  const manifest = await json(`plugins/${directory}/paseo-plugin.json`);
  const entry = catalog.plugins.find((plugin) => plugin.path === `plugins/${directory}`);
  if (pkg.version !== workspace.version || pkg.license !== workspace.license) errors.push(`${directory}: version/license mismatch.`);
  if (lock.packages?.[`plugins/${directory}`]?.version !== workspace.version) errors.push(`${directory}: lockfile version mismatch.`);
  const { version: paseoVersion, errors: paseoErrors } = validatePaseoMetadata({ catalog, entry, pkg, manifest, locked: lock.packages?.[`plugins/${directory}`] });
  errors.push(...paseoErrors.map((error) => `${directory}: ${error}`));
  if (paseoVersion?.startsWith("0.8.") || paseoVersion?.startsWith("0.9.")) {
    const files = await readdir(new URL(`plugins/${directory}/`, root));
    errors.push(...validateRuntimeEntries(files).map((error) => `${directory}: ${error}`));
  }
  if (!pkg.scripts?.test || !pkg.scripts?.typecheck) errors.push(`${directory}: required test/typecheck scripts missing.`);
  if (entry?.id !== manifest.id || entry?.readme !== `plugins/${directory}/README.md`) errors.push(`${directory}: catalog identity/guide mismatch.`);
  if (!entry?.description || !["preview", "experimental", "stable"].includes(entry?.maturity)) errors.push(`${directory}: missing description or invalid maturity.`);
  if (!Array.isArray(entry?.daemonPlatforms) || !entry.daemonPlatforms.length || entry.daemonPlatforms.some((value) => !["win32", "darwin", "linux"].includes(value))) errors.push(`${directory}: invalid platform metadata.`);
  await access(new URL(`plugins/${directory}/README.md`, root));
}
for (const file of ["LICENSE", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "SUPPORT.md", "docs/COMPATIBILITY.md", "docs/CONFIGURATION.md", "docs/RELEASING.md"]) await access(new URL(file, root));
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
if (!changelog.includes(`## ${workspace.version}`)) errors.push("Missing changelog entry for package version.");
if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else console.log(`Release metadata checked for ${directories.length} plugins at ${workspace.version}; this does not publish or certify a release.`);
