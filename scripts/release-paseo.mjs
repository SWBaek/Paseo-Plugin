// The collection default still applies to entries that have not migrated.
export function validatePaseoMetadata({ catalog, entry, pkg, manifest, locked }) {
  const version = entry?.paseoVersion ?? catalog.paseoVersion;
  const errors = [];
  if (!/^0\.(7|8|9)\.\d+(?:-[a-z0-9.-]+)?$/.test(version ?? "") || pkg.devDependencies?.["@getpaseo/plugin"] !== version) {
    errors.push("exact Paseo dependency must match catalog.");
  }
  for (const name of ["@getpaseo/plugin", "@getpaseo/client"]) {
    const dependency = pkg.devDependencies?.[name];
    if (dependency && (dependency !== version || locked?.devDependencies?.[name] !== dependency)) {
      errors.push(`${name} SDK/lockfile mismatch.`);
    }
  }
  if (version?.startsWith("0.8.") && manifest.requirements?.paseo !== "^0.8.0") {
    errors.push("migrated manifest must declare ^0.8.0.");
  }
  if (version?.startsWith("0.9.") && manifest.requirements?.paseo !== "^0.9.0") {
    errors.push("migrated manifest must declare ^0.9.0.");
  }
  return { version, errors };
}

export function validateRuntimeEntries(files) {
  const errors = [];
  const counts = ["client", "server"].map((runtime) =>
    files.filter((file) => new RegExp(`^index\\.${runtime}\\.tsx?$`).test(file)).length);
  if (counts.every((count) => count === 0)) errors.push("at least one runtime entry is required.");
  if (counts.some((count) => count > 1)) errors.push("use only one entry per runtime.");
  if (files.some((file) => /^index\.tsx?$/.test(file))) errors.push("remove the legacy mixed entry.");
  return errors;
}
