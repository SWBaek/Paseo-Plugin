import assert from "node:assert/strict";
import { test } from "node:test";
import { collectImports, importError } from "./check-git-source-imports.mjs";

const beta = "0.8.0-beta.1";
const nine = "0.9.0-beta.2";
test("reads imports without confusing comments, strings, and type-only forms", () => {
  assert.deepEqual(collectImports(`
    // import "ignored";
    const text = 'import "also-ignored"';
    import type { X } from "types";
    import { type Y } from "inline-types";
    export { type Z } from "export-types";
    import { value, type T } from "runtime";
    export * from "exports";
    type Other = import("import-types").Other;
    const lazy = import("lazy");
    const common = require("common");
    const unknown = import(variable);
  `), [
    { name: "types", typeOnly: true }, { name: "inline-types", typeOnly: true },
    { name: "export-types", typeOnly: true }, { name: "runtime", typeOnly: false },
    { name: "exports", typeOnly: false }, { name: "import-types", typeOnly: true },
    { name: "lazy", typeOnly: false }, { name: "common", typeOnly: false },
    { name: null, typeOnly: false },
  ]);
});

test("accepts the separate 0.8/0.9 runtime contracts and 0.7 imports", () => {
  for (const sdk of [beta, nine]) {
    for (const [file, name, typeOnly] of [
      ["index.client.tsx", "./client/main", false],
      ["client/main.tsx", "../shared/contract", false],
      ["client/main.tsx", "@getpaseo/plugin/client/react-native", false],
      ["shared/contract.ts", "@getpaseo/plugin", false],
      ["index.server.ts", "./server/scan", false],
      ["server/scan.ts", "node:child_process", false],
      ["index.server.ts", "@getpaseo/plugin/server", true],
    ]) assert.equal(importError({ name, typeOnly }, file, sdk), null);
  }
  assert.equal(importError({ name: "@getpaseo/plugin/react-native" }, "main.client.tsx", "0.7.2"), null);
  assert.equal(importError({ name: "@getpaseo/plugin/server" }, "usage.shared.ts", "0.7.2"), null);
});

test("rejects runtime leaks, including type-only and transitive shared edges", () => {
  for (const [file, name] of [
    ["index.client.tsx", "./server/scan"],
    ["client/main.tsx", "node:fs"],
    ["shared/contract.ts", "../server/scan"],
    ["shared/contract.ts", "@getpaseo/plugin/server"],
    ["shared/contract.ts", "react"],
    ["server/scan.ts", "../client/main"],
    ["server/scan.ts", "@getpaseo/plugin/client"],
    ["client/main.tsx", "@getpaseo/plugin/client/host"],
    ["client/main.tsx", "@getpaseo/plugin/react-native"],
    ["client/main.tsx", "../../../other-plugin/shared/contract"],
    ["client/main.tsx", "../test/stub"],
    ["index.ts", "./shared/contract"],
    ["index.server.ts", "@getpaseo/client"],
  ]) {
    for (const sdk of [beta, nine]) {
      for (const typeOnly of [false, true]) assert.ok(importError({ name, typeOnly }, file, sdk), `${sdk} ${file}: ${name}`);
    }
  }
  assert.ok(importError({ name: "@getpaseo/client", typeOnly: false }, "index.server.ts", beta));
  assert.ok(importError({ name: "uninstalled-package" }, "server/scan.ts", beta));
  assert.ok(importError({ name: null }, "client/main.tsx", beta));
});
