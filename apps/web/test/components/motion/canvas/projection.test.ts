import { expect, it } from "vitest";
import {
  projectTimelineCanvas,
  hitTestTimelineCanvas,
} from "../../../../src/components/motion/canvas/projection";
import { canvasFixture } from "./support";

it("uses the same scrolled scene for precise trim, key, easing and gap interaction", () => {
  const d = canvasFixture();
  const scene = projectTimelineCanvas(d.model, { left: 0, top: 0, width: 400, height: 48 });
  expect(hitTestTimelineCanvas(scene, 2, 12)?.kind).toBe("trimStart");
  expect(hitTestTimelineCanvas(scene, 98, 12)?.kind).toBe("trimEnd");
  expect(hitTestTimelineCanvas(scene, 50, 12)).toMatchObject({ kind: "clip", trackId: "first" });
  expect(hitTestTimelineCanvas(scene, 150, 12)).toMatchObject({ kind: "gap", start: 1, end: 2 });
  expect(hitTestTimelineCanvas(scene, 0, 36)).toMatchObject({ kind: "key", keyId: "a" });
  expect(hitTestTimelineCanvas(scene, 50, 36)).toMatchObject({ kind: "easing", keyId: "b" });
  expect(hitTestTimelineCanvas(scene, 25, 36)).toBeNull();
  const dragging = projectTimelineCanvas(
    {
      ...d.model,
      draft: {
        action: "keys",
        delta: { value: 1, rate: 2 },
        keyIds: new Set(["b"]),
        layerIds: new Set(),
      },
    },
    { left: 0, top: 0, width: 400, height: 48 },
  );
  expect(dragging.rows[1]?.items.some((item) => item.kind === "easing")).toBe(true);
  expect(hitTestTimelineCanvas(dragging, 75, 36)).toBeNull();
  expect(hitTestTimelineCanvas(scene, -1, 12)).toBeNull();
  expect(hitTestTimelineCanvas(scene, 400, 12)).toBeNull();
  const vertical = projectTimelineCanvas(
    { ...d.model, audioTracks: [d.audio] },
    { left: 0, top: 48, width: 400, height: 24 },
  );
  expect(vertical.rows.map((row) => row.key)).toEqual(["sound"]);
  expect(hitTestTimelineCanvas(vertical, 50, 12)).toMatchObject({
    kind: "audio",
    trackId: "sound",
  });
  const tinyRows = d.rows.map((row) => ({
    ...row,
    occurrences: [{ ...d.tracks[0]!, end: { value: 1, rate: 100 } }],
  }));
  const tiny = projectTimelineCanvas(
    { ...d.model, rows: tinyRows },
    { left: 0, top: 0, width: 100, height: 24 },
  );
  expect(hitTestTimelineCanvas(tiny, 0.2, 12)?.kind).toBe("trimStart");
  expect(hitTestTimelineCanvas(tiny, 1.8, 12)?.kind).toBe("trimEnd");
});
it("rejects invalid geometry and returns no rows outside the authored content", () => {
  const d = canvasFixture();
  const viewport = { left: 0, top: 0, width: 100, height: 50 };
  expect(() => projectTimelineCanvas({ ...d.model, scale: 0 }, viewport)).toThrow(RangeError);
  expect(() => projectTimelineCanvas(d.model, { ...viewport, height: Infinity })).toThrow(
    RangeError,
  );
  const empty = projectTimelineCanvas(d.model, { ...viewport, top: 100 });
  expect(empty.rows).toEqual([]);
  expect(hitTestTimelineCanvas(empty, 5, 5)).toBeNull();
});
it("shares animated HTML poses across paint, key/trim hits, offscreen admission and overlap stacking", () => {
  const d = canvasFixture();
  const scene = projectTimelineCanvas(
    {
      ...d.model,
      rowPositions: new Map([
        ["hero", { top: 12, height: 24, zIndex: 4, order: 0 }],
        ["position", { top: 0, height: 24, zIndex: 0, order: 1 }],
      ]),
    },
    { left: 0, top: 0, width: 400, height: 48 },
  );
  expect(scene.rows.map((row) => row.key)).toEqual(["position", "hero"]);
  expect(scene.rows.find((row) => row.key === "hero")?.items[0]?.bounds.y).toBe(15);
  expect(hitTestTimelineCanvas(scene, 1, 20)?.kind).toBe("trimStart");
  expect(hitTestTimelineCanvas(scene, 0, 10)).toMatchObject({ kind: "key", keyId: "a" });
  const retained = projectTimelineCanvas(
    {
      ...d.model,
      rowPositions: new Map([
        ["hero", { top: 0, height: 24, zIndex: 0, order: 0 }],
        ["position", { top: 4, height: 24, zIndex: 0, order: 1 }],
      ]),
    },
    { left: 0, top: 0, width: 100, height: 12 },
  );
  expect(retained.rows.some((row) => row.key === "position")).toBe(true);
  expect(hitTestTimelineCanvas(retained, 0, 6)).toMatchObject({ kind: "key", keyId: "a" });
});
