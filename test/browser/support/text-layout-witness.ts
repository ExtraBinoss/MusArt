import { createLayer, createPage } from "@musart/core";
import { createRenderSession } from "@musart/render";

/** Pixel equivalence: reused placement buffers versus independently constructed outline resources. */
export async function runTextLayoutWitness(forceWebGL: boolean) {
  const session = createRenderSession({ forceWebGL, maxBytes: 64 * 1024 * 1024 });
  const base = createLayer("text", {
    id: "reused",
    text: "Café office ffi AV",
    fontFamily: "Inter",
    fontWeight: 500,
    fontSize: 32,
    width: 600,
    height: 180,
    x: 4,
    y: 4,
    fill: "#ffffff",
  });
  const poses = [
    {},
    { letterSpacing: 4.5, textAlign: "center" as const },
    { fontSize: 40, letterSpacing: 1, textAlign: "right" as const },
    { width: 180, fontSize: 32 },
    { width: 180, height: 32, fontSize: 32 },
    { text: "A\u0301V office", letterSpacing: 3 },
    {},
  ];
  const frames: { reused: string; fresh: string; newOutlineResources: number }[] = [];
  try {
    for (let i = 0; i < poses.length; i++) {
      const layer = { ...base, ...poses[i] };
      const before = session.stats()?.uploads ?? 0;
      const reused = await session.withCanvasFrame(
        createPage({
          id: "reused-page",
          width: 640,
          height: 200,
          background: "#102020",
          layers: [layer],
        }),
        {},
        (canvas) => canvas.toDataURL("image/png"),
      );
      const newOutlineResources = (session.stats()?.uploads ?? 0) - before;
      const fresh = await session.withCanvasFrame(
        createPage({
          id: "reference-page",
          width: 640,
          height: 200,
          background: "#102020",
          layers: [{ ...layer, id: `fresh-${i}` }],
        }),
        {},
        (canvas) => canvas.toDataURL("image/png"),
      );
      frames.push({ reused, fresh, newOutlineResources });
    }
    return { frames, stats: session.stats(), readbacks: window.__musartVideoReadbacks };
  } finally {
    await session.dispose();
  }
}
