import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject, type ImageAsset } from "../../packages/core/src/index";
import { createShareYourWork } from "../../apps/web/src/services/projects/templates/motion/share-your-work";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";

export async function generateShareYourWork(
  directory = "apps/web/public/templates/motion",
  mediaDirectory = "apps/web/public/templates/motion/media/share-work",
) {
  const sources = JSON.parse(await readFile(resolve(mediaDirectory, "sources.json"), "utf8")) as {
    images: { file: string; name: string }[];
  };
  const photos: ImageAsset[] = await Promise.all(
    sources.images.map(async (image, index) => ({
      id: `share-photo-${index + 1}`,
      name: image.name,
      mime: "image/jpeg",
      width: 480,
      height: 480,
      dataUrl: `data:image/jpeg;base64,${(await readFile(resolve(mediaDirectory, image.file))).toString("base64")}`,
    })),
  );
  const built = createShareYourWork(photos);
  validateProject(built.project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "share-your-work",
    project: built.project,
    originals: [],
  };
  await mkdir(directory, { recursive: true });
  const written: string[] = [];
  for (const [name, content] of Object.entries({
    "share-your-work.json": JSON.stringify(manifest),
    "share-your-work.musart": serializeProject(built.project),
    "share-your-work.commands.json": JSON.stringify({
      version: 1,
      initial: built.initial,
      batches: built.batches,
    }),
  })) {
    const path = resolve(directory, name);
    await writeFile(path, `${content}\n`);
    written.push(path);
  }
  return written;
}
if (import.meta.main) await generateShareYourWork();
