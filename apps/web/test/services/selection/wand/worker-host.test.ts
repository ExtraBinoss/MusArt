import { expect, it } from "vitest";
import {
  createWandHost,
  MAX_SELECTION_PIXELS,
} from "../../../../src/services/selection/wand/worker-host";
import type {
  WandRequest,
  WandResponse,
  SelectionMode,
} from "../../../../src/services/selection/wand/model";
function fixture() {
  const host = createWandHost();
  let id = 0;
  function send(
    request:
      | Omit<Extract<WandRequest, { type: "source" }>, "id">
      | Omit<Extract<WandRequest, { type: "preview" }>, "id">
      | { type: "accept" | "export" | "invert" },
  ) {
    return host({ ...request, id: ++id } as WandRequest);
  }
  send({
    type: "source",
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([10, 10, 10, 255, 50, 50, 50, 255, 10, 10, 10, 255]),
  });
  const select = (x: number, mode: SelectionMode = "new", contiguous = true, tolerance = 0) =>
    send({ type: "preview", x, y: 0, mode, contiguous, tolerance });
  function preview(value: WandResponse) {
    if (!("preview" in value)) throw Error(JSON.stringify(value));
    return value.preview;
  }
  return { host, send, select, preview };
}
it("keeps drafts separate from accepted selections and composes real selection modes", () => {
  const d = fixture();
  expect(d.preview(d.select(0)).selected).toBe(1);
  d.send({ type: "accept" });
  expect(d.preview(d.select(2, "add")).selected).toBe(2);
  // An unaccepted draft must not become the base of the next gesture.
  expect(d.preview(d.select(0, "subtract")).selected).toBe(0);
  d.select(2, "add");
  d.send({ type: "accept" });
  expect(d.preview(d.select(0, "subtract")).selected).toBe(1);
  d.send({ type: "accept" });
  expect(d.preview(d.select(2, "intersect")).selected).toBe(1);
  d.send({ type: "accept" });
  expect(d.preview(d.send({ type: "invert" })).selected).toBe(2);
  const response = d.send({ type: "export" });
  expect("mask" in response && Array.from(response.mask.data)).toEqual([
    255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
  ]);
});
it("matches noncontiguous colors, adjusts tolerance and preserves fractional source coverage", () => {
  const d = fixture();
  expect(d.preview(d.select(0, "new", false)).selected).toBe(2);
  expect(d.preview(d.select(0, "new", true, 255)).selected).toBe(3);
  d.send({
    type: "source",
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([10, 10, 10, 128, 10, 10, 10, 0]),
  });
  expect(d.preview(d.select(99, "new", false)).selected).toBe(0);
  d.select(-20, "new", false);
  d.send({ type: "accept" });
  const mask = d.send({ type: "export" });
  expect("mask" in mask && Array.from(mask.mask.data)).toEqual([128, 128, 128, 255, 0, 0, 0, 255]);
  d.select(0, "subtract");
  d.send({ type: "accept" });
  const subtracted = d.send({ type: "export" });
  expect("mask" in subtracted && subtracted.mask.data[0]).toBe(64);
});
it("rejects missing, malformed and oversized sources before allocating selection arrays", () => {
  const host = createWandHost();
  expect(host({ id: 1, type: "export" })).toHaveProperty(
    "error",
    "Pixel selection source is missing.",
  );
  for (const [width, height] of [
    [0, 1],
    [1, NaN],
    [MAX_SELECTION_PIXELS + 1, 1],
    [1, 1],
  ])
    expect(
      host({
        id: 2,
        type: "source",
        width: width!,
        height: height!,
        data: new Uint8ClampedArray(0),
      }),
    ).toHaveProperty("error");
  const d = fixture();
  for (const patch of [{ tolerance: NaN }, { mode: "invalid" }, { contiguous: "yes" }])
    expect(
      d.host({
        id: 3,
        type: "preview",
        x: 0,
        y: 0,
        mode: "new",
        contiguous: true,
        tolerance: 0,
        ...patch,
      } as WandRequest),
    ).toHaveProperty("error", "Invalid pixel selection gesture.");
  expect(d.host({ id: 4, type: "unknown" } as unknown as WandRequest)).toHaveProperty(
    "error",
    "Unknown pixel selection request.",
  );
});
