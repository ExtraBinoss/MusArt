import { expect, test } from "vitest";
import { syncArtboardBackdrops } from "../../../src/canvas/artboards/backdrop-presentation";

test("hides only the active thumbnail after a matching project and page have actually drawn", () => {
  const viewport = document.createElement("div");
  viewport.innerHTML = `<div class="canvas-artboard-backdrop" data-artboard-id="a" data-project-id="project" data-backdrop-active="true"><img></div>
    <div class="canvas-artboard-backdrop" data-artboard-id="b" data-project-id="project" data-backdrop-active="false"><img></div>
    <div class="canvas-artboard-editor"><canvas></canvas></div>`;
  const a = viewport.children[0] as HTMLElement,
    b = viewport.children[1] as HTMLElement,
    canvas = viewport.querySelector("canvas")!;
  Object.assign(canvas.dataset, { pageId: "a", projectId: "project", presentationReady: "false" });
  canvas.style.visibility = "hidden";
  syncArtboardBackdrops(viewport);
  expect(a.dataset.gpuCovered).toBe("false");
  canvas.style.visibility = "visible";
  canvas.dataset.presentationReady = "true";
  syncArtboardBackdrops(viewport);
  expect(a.dataset.gpuCovered).toBe("true");
  expect(b.dataset.gpuCovered).toBeUndefined();
  // Activation before rendering leaves the destination's real thumbnail available.
  a.dataset.backdropActive = "false";
  b.dataset.backdropActive = "true";
  syncArtboardBackdrops(viewport);
  expect(b.dataset.gpuCovered).toBe("false");
  canvas.dataset.pageId = "b";
  syncArtboardBackdrops(viewport);
  expect(b.dataset.gpuCovered).toBe("true");
  // A replacement project with reused page IDs must not inherit old coverage.
  b.dataset.projectId = "replacement";
  syncArtboardBackdrops(viewport);
  expect(b.dataset.gpuCovered).toBe("false");
  canvas.dataset.projectId = "replacement";
  syncArtboardBackdrops(viewport);
  expect(b.dataset.gpuCovered).toBe("true");
  canvas.style.visibility = "hidden";
  syncArtboardBackdrops(viewport);
  expect(b.dataset.gpuCovered).toBe("false");
  canvas.remove();
  syncArtboardBackdrops(viewport);
  syncArtboardBackdrops(null);
  expect(b.dataset.gpuCovered).toBe("false");
});
