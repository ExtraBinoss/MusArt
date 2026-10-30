import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject } from "../../packages/core/src/index";
import { createMorphingType } from "../../apps/web/src/services/projects/templates/motion/morphing-type";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";

export async function generateMorphingType(directory = "apps/web/public/templates/motion") {
  const built = createMorphingType();
  validateProject(built.project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "morphing-type",
    project: built.project,
    originals: [],
  };
  await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries({
    "morphing-type.json": JSON.stringify(manifest),
    "morphing-type.musart": serializeProject(built.project),
    "morphing-type.commands.json": JSON.stringify({
      version: 1,
      initial: built.initial,
      batches: built.batches,
    }),
  }))
    await writeFile(resolve(directory, name), content + "\n");
}
if (import.meta.main) await generateMorphingType();
