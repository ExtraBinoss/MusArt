import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  EditorEngine,
  parseProject,
  type Command,
  type Project,
} from "../../../packages/core/src/index";
import { generateMotionTemplates } from "../../../scripts/templates/generate";

test("generates checked-in source-backed bundles and auditable reproducible public command batches without a browser", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "musart-motion-templates-"));
  try {
    const options = {
      outputDirectory,
      mediaDirectory: resolve("apps/web/public/templates/motion/media"),
    };
    const paths = await generateMotionTemplates(options);
    expect(paths).toHaveLength(9);
    const first = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    await generateMotionTemplates(options);
    expect(await Promise.all(paths.map((path) => readFile(path, "utf8")))).toEqual(first);
    for (const id of ["in-bloom", "motion-stress-lab", "sound-playground"]) {
      const commands = JSON.parse(
        await readFile(join(outputDirectory, `${id}.commands.json`), "utf8"),
      ) as { initial: Project; batches: Command[][] };
      const expected = parseProject(await readFile(join(outputDirectory, `${id}.musart`), "utf8"));
      const engine = new EditorEngine(commands.initial, { now: () => commands.initial.createdAt });
      for (const batch of commands.batches) engine.transaction(batch);
      expect(engine.getSnapshot().project).toEqual(expected);
      const bundle = JSON.parse(await readFile(join(outputDirectory, `${id}.json`), "utf8"));
      expect(bundle.project).toEqual(expected);
      expect(bundle.originals).toHaveLength(id === "sound-playground" ? 3 : 4);
      if (id === "sound-playground")
        expect(
          bundle.originals.every((entry: { mime: string }) => entry.mime === "audio/wav"),
        ).toBe(true);
      else expect(bundle.originals[0].file).toBe("media/flower.mp4");
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
