import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { generateDesignedTemplates } from "../../../scripts/templates/designed";
import { parseProject } from "../../../packages/core/src/index";

it("writes deterministic portable projects and replay journals without a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "musart-designed-"));
  try {
    const paths = await generateDesignedTemplates(directory);
    expect(paths).toHaveLength(12);
    const before = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    for (const path of paths.filter((path) => path.endsWith(".musart")))
      expect(parseProject(await readFile(path, "utf8")).pages).toHaveLength(1);
    await generateDesignedTemplates(directory);
    expect(await Promise.all(paths.map((path) => readFile(path, "utf8")))).toEqual(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
