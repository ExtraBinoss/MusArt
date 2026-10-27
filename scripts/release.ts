import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

interface Manifest {
  version: string;
  [key: string]: unknown;
}
export interface ReleaseChange {
  file: string;
  before: string;
  after: string;
}
export interface ReleasePlan {
  version: string;
  changes: ReleaseChange[];
}
function parseVersion(version: string): [number, number, number] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error("Release versions must use X.Y.Z without leading zeroes.");
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("Release version is too large.");
  return parts as [number, number, number];
}
export function nextVersion(current: string, target: string): string {
  const parts = parseVersion(current);
  const position = ["major", "minor", "patch"].indexOf(target);
  if (position >= 0) {
    parts[position]!++;
    for (let index = position + 1; index < 3; index++) parts[index] = 0;
    const result = parts.join(".");
    parseVersion(result);
    return result;
  }
  const next = parseVersion(target);
  for (let index = 0; index < 3; index++) {
    if (next[index]! > parts[index]!) return target;
    if (next[index]! < parts[index]!) throw new Error("A release cannot lower the version.");
  }
  return target;
}
async function manifests(root: string) {
  const files = [join(root, "package.json")];
  for (const folder of ["apps", "packages"]) {
    if (!existsSync(join(root, folder))) continue;
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = join(root, folder, entry.name, "package.json");
      if (entry.isDirectory() && existsSync(path)) files.push(path);
    }
  }
  return Promise.all(
    files.sort().map(async (file) => {
      const before = await readFile(file, "utf8");
      const value = JSON.parse(before) as Manifest;
      parseVersion(value.version);
      return { file, before, value };
    }),
  );
}
export async function checkVersions(root: string): Promise<string> {
  const items = await manifests(root);
  const version = items.find((item) => item.file === join(root, "package.json"))!.value.version;
  for (const item of items)
    if (item.value.version !== version)
      throw new Error(
        `Workspace version mismatch: ${relative(root, item.file)} (${item.value.version}, expected ${version}).`,
      );
  return version;
}
/** Prepare all edits before touching a file; initial releases may use the current version. */
export async function prepareRelease(
  root: string,
  target: string,
  date: string,
): Promise<ReleasePlan> {
  const version = nextVersion(await checkVersions(root), target);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid release date.");
  const file = join(root, "CHANGELOG.md"),
    before = await readFile(file, "utf8");
  const marker = /^## \[Unreleased\][^\n]*\n/m.exec(before);
  if (!marker) throw new Error("CHANGELOG.md needs an [Unreleased] section.");
  if (before.includes(`## [${version}]`))
    throw new Error(`Version ${version} already has release notes.`);
  const start = marker.index + marker[0].length;
  const remaining = before.slice(start),
    next = /^## \[/m.exec(remaining);
  const notes = remaining.slice(0, next?.index ?? remaining.length).trim();
  if (!notes) throw new Error("Add feature and fix notes under [Unreleased] before releasing.");
  const after = `${before.slice(0, marker.index)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n${next ? `\n${remaining.slice(next.index)}` : ""}`;
  const changes: ReleaseChange[] = [{ file, before, after }];
  for (const item of await manifests(root))
    changes.push({
      file: item.file,
      before: item.before,
      after: JSON.stringify({ ...item.value, version }, null, 2) + "\n",
    });
  return { version, changes };
}
export async function applyRelease(
  plan: ReleasePlan,
  writer = (file: string, value: string) => writeFile(file, value),
): Promise<void> {
  const written: ReleaseChange[] = [];
  try {
    for (const change of plan.changes) {
      if (change.before === change.after) continue;
      await writer(change.file, change.after);
      written.push(change);
    }
  } catch (error) {
    const recovery = await Promise.allSettled(
      written.map((change) => writer(change.file, change.before)),
    );
    const failures = recovery
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason as unknown);
    if (failures.length)
      throw new AggregateError([error, ...failures], "Release preparation and rollback failed.");
    throw error;
  }
}
if (import.meta.main) {
  const argument = process.argv.slice(2).find((value) => value !== "--");
  if (!argument)
    throw new Error(
      "Usage: bun run release -- <major|minor|patch|X.Y.Z>, or bun run version:check.",
    );
  if (argument === "--check")
    console.log(`Workspace versions match: ${await checkVersions(process.cwd())}`);
  else {
    const plan = await prepareRelease(
      process.cwd(),
      argument,
      new Date().toISOString().slice(0, 10),
    );
    await applyRelease(plan);
    console.log(
      `Prepared ${plan.version}. Run the quality gates and commit the release notes and versions.`,
    );
  }
}
