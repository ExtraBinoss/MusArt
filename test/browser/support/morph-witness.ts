import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  createEffect,
  createLayer,
  createPage,
  createProject,
  MOTION_ANIMATION_PRESETS,
  EditorEngine,
} from "@musart/core";
import { createRenderSession, exportMotionVideo } from "@musart/render";
import { createMorphingType } from "../../../apps/web/src/services/projects/templates/motion/morphing-type";

export async function runMorphWitness(forceWebGL: boolean) {
  const built = createMorphingType(),
    program = compileMotion(built.project, { compositionId: built.project.pages[0]!.id });
  const session = createRenderSession({ forceWebGL, maxBytes: 96 * 1024 * 1024 });
  const frames: { frame: number; png: string; uploads: number; milliseconds: number }[] = [];
  try {
    for (const frame of [
      ...(forceWebGL ? [0, 15, 30, 54, 66] : Array.from({ length: 67 }, (_, i) => i)),
      30,
      0,
    ]) {
      const pose = applyMotionFrame(program, evaluateMotion(program, { value: frame, rate: 30 }));
      const started = performance.now();
      const png = await session.withCanvasFrame(pose, built.project.assets, (canvas) =>
        canvas.toDataURL("image/png"),
      );
      frames.push({
        frame,
        png,
        uploads: session.stats()?.uploads ?? 0,
        milliseconds: performance.now() - started,
      });
    }
    const generated = createProject({
      pages: [
        createPage({
          width: 400,
          height: 150,
          layers: [
            createLayer("text", {
              id: "editable",
              x: 0,
              y: 0,
              text: "HELLO",
              width: 400,
              height: 150,
              fontFamily: "Inter Variable",
              fontSize: 42,
              fontWeight: 800,
              fill: "#00b9fc",
              textAlign: "center",
            }),
          ],
        }),
      ],
    });
    const engine = new EditorEngine(generated);
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({
      type: "addMotionAnimation",
      trackId: engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id,
      preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "type-inflate")!,
      start: { value: 0, rate: 1 },
    });
    const current = engine.getSnapshot().project,
      compiled = compileMotion(current, { compositionId: current.pages[0]!.id });
    const text: string[] = [];
    for (const value of [0, 1200]) {
      const pose = applyMotionFrame(compiled, evaluateMotion(compiled, { value, rate: 1000 }));
      text.push(await session.withCanvasFrame(pose, {}, (canvas) => canvas.toDataURL("image/png")));
    }
    const vector = createPage({
      width: 180,
      height: 120,
      layers: [
        createLayer("vector", {
          id: "vector",
          x: 0,
          y: 0,
          width: 180,
          height: 120,
          fill: "#00b9fc",
          vector: { viewBox: "0 0 1 1", path: "M0 0 L1 0 L1 1 L0 1 Z" },
          effects: [
            createEffect("morph", {
              shapeMorph: {
                version: 1,
                shapes: [
                  {
                    frames: [
                      {
                        at: 0,
                        box: [0, 0, 1, 1],
                        contours: [
                          {
                            hole: false,
                            points: [
                              [0, 0],
                              [1, 0],
                              [1, 1],
                              [0, 1],
                            ],
                          },
                        ],
                      },
                      {
                        at: 1,
                        box: [0, 0, 1, 1],
                        contours: [
                          {
                            hole: false,
                            points: [
                              [0.5, 0],
                              [1, 0.5],
                              [0.5, 1],
                              [0, 0.5],
                            ],
                          },
                          {
                            hole: true,
                            points: [
                              [0.4, 0.4],
                              [0.6, 0.4],
                              [0.6, 0.6],
                              [0.4, 0.6],
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              settings: { progress: 1, stagger: 0 },
            }),
          ],
        }),
      ],
    });
    const shape = await session.withCanvasFrame(vector, {}, (canvas) =>
      canvas.toDataURL("image/png"),
    );
    return {
      frames,
      text,
      shape,
      stats: session.stats(),
      readbacks: window.__musartVideoReadbacks,
    };
  } finally {
    await session.dispose();
  }
}

export async function exportMorphReference() {
  const { project } = createMorphingType();
  const result = await exportMotionVideo(project, {
    compositionId: project.pages[0]!.id,
    frameRate: { numerator: 30, denominator: 1 },
    container: "mp4",
    audio: false,
  });
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(Error("The encoded video could not be read"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(result.blob!);
  });
  return {
    data,
    frames: result.frameCount,
    duration: result.duration,
    bytes: result.bytes,
    readbacks: window.__musartVideoReadbacks,
  };
}
