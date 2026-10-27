import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { applyRelease, checkVersions, nextVersion, prepareRelease } from "../../scripts/release";
const folders: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "musart-release-"));
  folders.push(root);
  await mkdir(join(root, "packages/core"), { recursive: true });
  await mkdir(join(root, "apps/web"), { recursive: true });
  for (const file of ["package.json", "packages/core/package.json", "apps/web/package.json"])
    await writeFile(
      join(root, file),
      JSON.stringify({ name: file, version: "0.1.0" }, null, 2) + "\n",
    );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A real feature.\n",
  );
  return root;
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
it("calculates semantic release increments and rejects invalid or decreasing versions", () => {
  expect(nextVersion("0.1.2", "major")).toBe("1.0.0");
  expect(nextVersion("0.1.2", "minor")).toBe("0.2.0");
  expect(nextVersion("0.1.2", "patch")).toBe("0.1.3");
  expect(nextVersion("0.1.2", "0.1.2")).toBe("0.1.2");
  expect(nextVersion("0.1.2", "2.0.0")).toBe("2.0.0");
  for (const target of ["0.0.9", "0.1.1", "v1.0.0", "01.0.0", "latest", "9007199254740992.0.0"])
    expect(() => nextVersion("0.1.2", target)).toThrow();
});
it("prepares dated notes and synchronizes all workspaces without changing files until applied", async () => {
  const root = await fixture(),
    plan = await prepareRelease(root, "minor", "2026-10-27");
  expect(await checkVersions(root)).toBe("0.1.0");
  expect(plan.version).toBe("0.2.0");
  await applyRelease(plan);
  expect(await checkVersions(root)).toBe("0.2.0");
  expect(await readFile(join(root, "CHANGELOG.md"), "utf8")).toContain(
    "## [Unreleased]\n\n## [0.2.0] - 2026-10-27\n\n### Added",
  );
  await expect(prepareRelease(root, "0.2.0", "2026-10-27")).rejects.toThrow(
    "already has release notes",
  );
});
it("requires reviewed notes, matching versions and a valid date", async () => {
  const root = await fixture();
  for (const date of ["tomorrow", "2026-02-31", "2026-13-01", "2026-1-01"])
    await expect(prepareRelease(root, "patch", date)).rejects.toThrow("date");
  await writeFile(join(root, "CHANGELOG.md"), "## [Unreleased]\n\n");
  await expect(prepareRelease(root, "patch", "2026-10-27")).rejects.toThrow("Add feature");
  await writeFile(join(root, "CHANGELOG.md"), "# Missing notes");
  await expect(prepareRelease(root, "patch", "2026-10-27")).rejects.toThrow("Unreleased");
  await writeFile(join(root, "apps/web/package.json"), JSON.stringify({ version: "0.2.0" }));
  await expect(checkVersions(root)).rejects.toThrow("Workspace version mismatch");
});
it("preserves older releases and supports an initial release at the current version", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n- New.\n\n## [0.0.1] - 2026-01-01\n\n- Old.\n",
  );
  const plan = await prepareRelease(root, "0.1.0", "2026-10-27");
  await applyRelease(plan);
  const notes = await readFile(join(root, "CHANGELOG.md"), "utf8");
  expect(notes).toContain("## [0.1.0] - 2026-10-27");
  expect(notes).toContain("## [0.0.1] - 2026-01-01\n\n- Old.");
});
it("restores already-written files when a later write fails", async () => {
  const root = await fixture(),
    plan = await prepareRelease(root, "patch", "2026-10-27");
  let writes = 0;
  await expect(
    applyRelease(plan, async (file, contents) => {
      if (++writes === 2) throw new Error("disk error");
      await writeFile(file, contents);
    }),
  ).rejects.toThrow("disk error");
  expect(await readFile(join(root, "CHANGELOG.md"), "utf8")).toBe(plan.changes[0]!.before);
  expect(await checkVersions(root)).toBe("0.1.0");
});
