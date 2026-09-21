// Uses an explicitly supplied, exact-version Paseo compiler without starting a daemon.
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [pluginArgument, serverArgument] = process.argv.slice(2);
if (!pluginArgument || !serverArgument) {
  throw new Error("Usage: node scripts/check-plugin-compiler.mjs <plugin-directory> <@getpaseo/server-package-directory>");
}
const pluginDirectory = path.resolve(pluginArgument);
const serverDirectory = path.resolve(serverArgument);
const json = async (directory) => JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
const plugin = await json(pluginDirectory);
const server = await json(serverDirectory);
if (server.name !== "@getpaseo/server" || server.version !== plugin.devDependencies?.["@getpaseo/plugin"] || server.version !== "0.9.0-beta.2") {
  throw new Error("Supply @getpaseo/server 0.9.0-beta.2 matching the plugin's exact SDK. Recheck the private compiler API before changing versions.");
}
const { compilePlugin } = await import(pathToFileURL(path.join(serverDirectory, "dist/server/server/plugins/compiler.js")).href);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "paseo-plugin-compiler-"));
try {
  const staged = path.join(temporaryRoot, "source");
  await cp(pluginDirectory, staged, {
    recursive: true,
    filter: (source) => !path.relative(pluginDirectory, source).split(path.sep).some((segment) =>
      ["node_modules", ".git", "test", "tests"].includes(segment) || /(?:\.(?:test|spec)\.[cm]?[jt]sx?|^vitest\.config\.[cm]?[jt]sx?)$/.test(segment)),
  });
  const entries = await readdir(staged);
  const entry = (runtime) => {
    const found = entries.filter((name) => new RegExp(`^index\\.${runtime}\\.tsx?$`).test(name));
    if (found.length > 1) throw new Error(`Multiple ${runtime} entries`);
    return found.length ? path.join(staged, found[0]) : null;
  };
  const client = entry("client");
  const serverEntry = entry("server");
  if (!client && !serverEntry) throw new Error("No runtime entries");
  const result = await compilePlugin({ client, server: serverEntry });
  if ((client && !result.clientBundle) || (serverEntry && !result.serverBundle)) throw new Error("Missing compiled bundle");
  console.log(JSON.stringify({
    plugin: plugin.name, compiler: server.version, nodeModules: false,
    clientBytes: result.clientBundle ? Buffer.byteLength(result.clientBundle) : 0,
    serverBytes: result.serverBundle ? Buffer.byteLength(result.serverBundle) : 0,
  }));
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("paseo-plugin-compiler-")) {
    throw new Error(`Refusing to remove unexpected temporary directory: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}
