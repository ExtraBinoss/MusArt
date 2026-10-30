import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseProject } from "../../../packages/core/src/index";
import { generateMorphingType } from "../../../scripts/templates/morphing-type";
test("writes a portable project, manifest and replayable command sidecar", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melt-morph-template-"));
  try {
    await generateMorphingType(directory);
    const manifest = JSON.parse(await readFile(join(directory, "morphing-type.json"), "utf8"));
    const project = parseProject(await readFile(join(directory, "morphing-type.musart"), "utf8"));
    expect(manifest.project).toEqual(project);
    expect(manifest.originals).toEqual([]);
    const replay = JSON.parse(
      await readFile(join(directory, "morphing-type.commands.json"), "utf8"),
    );
    expect(replay.batches.length).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
