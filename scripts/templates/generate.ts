import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { serializeProject, validateProject } from "../../packages/core/src/index";
import { createBloomTemplate } from "../../apps/web/src/services/projects/templates/motion/showcase";
import { isOriginalMediaAsset } from "../../packages/core/src/index";
import { createSoundPlayground } from "../../apps/web/src/services/projects/templates/motion/sound-playground";
import { createStressTemplate } from "../../apps/web/src/services/projects/templates/motion/stress";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";
import { readTemplateMedia } from "./media";

/** Reproducible, real engine command authoring. No browser, GPU, React or editor UI is involved. */
export async function generateMotionTemplates(options: {
  mediaDirectory: string;
  outputDirectory: string;
}): Promise<string[]> {
  const { media, originals, audioOriginals } = await readTemplateMedia(options.mediaDirectory);
  await mkdir(options.outputDirectory, { recursive: true });
  for (const original of audioOriginals) {
    const path = resolve(options.outputDirectory, original.file);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, original.data);
  }
  const written: string[] = [];
  for (const [templateId, build] of [
    ["in-bloom", createBloomTemplate],
    ["motion-stress-lab", createStressTemplate],
    ["sound-playground", createSoundPlayground],
  ] as const) {
    const { initial, project, batches } = build(media);
    validateProject(project);
    const usedOriginals = new Set(
      Object.values(project.assets)
        .filter(isOriginalMediaAsset)
        .map((asset) => asset.originalId),
    );
    const manifest: MotionTemplateManifest = {
      version: 1,
      templateId,
      project,
      originals: originals.filter((original) => usedOriginals.has(original.originalId)),
    };
    const files = {
      [`${templateId}.json`]: JSON.stringify(manifest),
      [`${templateId}.musart`]: serializeProject(project),
      [`${templateId}.commands.json`]: JSON.stringify({ version: 1, initial, batches }),
    };
    for (const [name, contents] of Object.entries(files)) {
      const path = resolve(options.outputDirectory, name);
      await writeFile(path, `${contents}\n`);
      written.push(path);
    }
  }
  return written;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      media: { type: "string", default: "apps/web/public/templates/motion/media" },
      output: { type: "string", default: "apps/web/public/templates/motion" },
    },
  });
  for (const path of await generateMotionTemplates({
    mediaDirectory: values.media,
    outputDirectory: values.output,
  }))
    console.log(path);
}
