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

export const ANIMATION_PREVIEW_IMAGE = `${import.meta.env.BASE_URL}benchmark/06-boathouse-1.jpg`;
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
          name: "Alpine lake — Luca Bravo",
          mime: "image/jpeg",
          width: 1280,
          height: 960,
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
            createLayer(preset.category === "typography" ? "text" : "image", {
              id: "subject",
              assetId: preset.category === "typography" ? null : "photo",
              text: "MORPH",
              fontSize: 32,
              fontWeight: 800,
              fontFamily: "Inter Variable",
              fill: "#00bdf5",
              textAlign: "center",
              x: 21,
              y: 15.75,
              width: 150,
              height: 112.5,
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
