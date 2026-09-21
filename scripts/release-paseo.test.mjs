import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePaseoMetadata, validateRuntimeEntries } from "./release-paseo.mjs";

function metadata(version = "0.8.0") {
  const devDependencies = { "@getpaseo/plugin": version, "@getpaseo/client": version };
  return {
    catalog: { paseoVersion: "0.7.2" }, entry: { paseoVersion: version },
    pkg: { devDependencies }, locked: { devDependencies: { ...devDependencies } },
    manifest: { requirements: { paseo: "^0.8.0" } },
  };
}

test("independent migrations preserve the default and enforce the entry override", () => {
  assert.deepEqual(validatePaseoMetadata(metadata()), { version: "0.8.0", errors: [] });
  assert.deepEqual(validatePaseoMetadata(metadata("0.8.0-beta.1")), { version: "0.8.0-beta.1", errors: [] });
  const legacy = metadata("0.7.2");
  legacy.entry = {};
  legacy.manifest = {};
  assert.deepEqual(validatePaseoMetadata(legacy), { version: "0.7.2", errors: [] });
});

test("rejects a stale catalog, non-exact SDK, wrong client and stale lockfile", () => {
  for (const mutate of [
    (data) => { data.entry = {}; },
    (data) => { data.entry.paseoVersion = "^0.8.0"; },
    (data) => { data.pkg.devDependencies["@getpaseo/client"] = "0.7.2"; },
    (data) => { data.locked.devDependencies["@getpaseo/plugin"] = "0.7.2"; },
  ]) {
    const data = metadata();
    mutate(data);
    assert.ok(validatePaseoMetadata(data).errors.length);
  }
});

test("a final 0.8 entry requires the migrated manifest even when the SDK matches", () => {
  const data = metadata();
  data.manifest = {};
  assert.deepEqual(validatePaseoMetadata(data).errors, ["migrated manifest must declare ^0.8.0."]);
});

test("a 0.9 entry requires ^0.9.0 and exact SDK/catalog values", () => {
  const data = metadata("0.9.0-beta.2");
  data.manifest = { requirements: { paseo: "^0.9.0" } };
  assert.deepEqual(validatePaseoMetadata(data), { version: "0.9.0-beta.2", errors: [] });
  data.manifest = { requirements: { paseo: "^0.8.0" } };
  assert.deepEqual(validatePaseoMetadata(data).errors, ["migrated manifest must declare ^0.9.0."]);
});

test("runtime entries support single-runtime plugins and reject half-migrations", () => {
  for (const files of [["index.client.tsx", "index.server.ts"], ["index.client.ts"], ["index.server.tsx"]]) {
    assert.deepEqual(validateRuntimeEntries(files), []);
  }
  for (const files of [[], ["index.ts"], ["index.client.tsx", "index.ts"], ["index.client.ts", "index.client.tsx"]]) {
    assert.ok(validateRuntimeEntries(files).length);
  }
});
