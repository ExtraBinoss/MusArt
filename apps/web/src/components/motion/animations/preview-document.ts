import {
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type MotionProgram,
  type Project,
  type MotionAnimationPreset,
} from "@musart/core";

export const ANIMATION_PREVIEW_IMAGE = `${import.meta.env.BASE_URL}templates/motion/media/painted-hand-298-332.jpg`;
let photo: Promise<string> | undefined;
const originals = new WeakMap<MotionProgram, Project["assets"]>();
export function animationPreviewAssets(program: MotionProgram) {
  return originals.get(program) ?? {};
}
function previewPhoto() {
  return (photo ??= fetch(ANIMATION_PREVIEW_IMAGE)
    .then(async (response) => {
      if (!response.ok) throw Error("Animation preview image could not be loaded");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 1024 * 1024) throw Error("Animation preview image is too large");
      return `data:image/jpeg;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
    })
    .catch((error) => {
      photo = undefined;
      throw error;
    }));
}
/** Every tile uses the same photo and the actual native command/evaluation/rendering path. */
export async function createAnimationPreviewDocument(
  preset: MotionAnimationPreset,
  duration: number,
) {
  const image = await previewPhoto();
  const engine = new EditorEngine(
    createProject({
      id: "animation-preview",
      assets: {
        photo: {
          id: "photo",
          name: "Painted hand",
          mime: "image/jpeg",
          width: 298,
          height: 332,
          dataUrl: image,
        },
      },
      pages: [
        createPage({
          id: "preview",
          width: 192,
          height: 144,
          background: "#20232b",
          layers: [
            createLayer("image", {
              id: "subject",
              assetId: "photo",
              x: 42,
              y: 12,
              width: 108,
              height: 120,
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const trackId = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  engine.transaction([
    { type: "setMotionDuration", duration: { value: duration, rate: 1000 } },
    {
      type: "addMotionAnimation",
      trackId,
      preset,
      start: { value: 0, rate: 1 },
      duration: { value: duration, rate: 1000 },
    },
  ]);
  const program = compileMotion(engine.getSnapshot().project, { compositionId: "preview" });
  originals.set(program, engine.getSnapshot().project.assets);
  return program;
}
