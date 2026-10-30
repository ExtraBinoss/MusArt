import { afterEach, expect, it, vi } from "vitest";
import { timelineKeyboardTarget } from "../../../../src/components/motion/canvas/keyboard";
import type { TimelineCanvasHost } from "../../../../src/components/motion/canvas/host";
import type {
  TimelineCanvasHit,
  TimelineCanvasModel,
} from "../../../../src/components/motion/canvas/model";
import type { TimelineRow } from "../../../../src/components/motion/tree";
import { canvasFixture } from "./support";

type KeyHit = Extract<TimelineCanvasHit, { kind: "key" }>;

afterEach(() => {
  vi.restoreAllMocks();
});

function fixture() {
  const d = canvasFixture(),
    viewport = document.createElement("div");
  Object.defineProperties(viewport, { clientWidth: { value: 344 }, clientHeight: { value: 80 } });
  const original = d.rows[1]!;
  if (original.kind !== "property") throw Error("Expected property fixture");
  const property = (id: string, times: number[]): TimelineRow => ({
    ...original,
    key: id,
    property: {
      ...original.property,
      id,
      keyframes: times.map((value, index) => ({
        id: `${id}-${index}`,
        time: { value, rate: 2 },
        value,
      })),
    },
  });
  let model: TimelineCanvasModel = {
    ...d.model,
    rows: [
      d.rows[0]!,
      original,
      { ...d.rows[0]!, key: "separator" },
      property("empty", []),
      property("vertical", [1, 4]),
      property("rotation", [2, 6]),
    ],
  };
  const host: TimelineCanvasHost = {
    viewport: { current: viewport },
    root: { current: null },
    readModel: () => model,
    readHit: () => null,
    readSurface: () => null,
    invalidate: vi.fn(),
    selectAudio: vi.fn(),
    readSelectedAudio: () => null,
    subscribeAudioSelection: () => () => undefined,
    setAudioDraft: vi.fn(),
    setHoverHit: vi.fn(),
  };
  const hit = (rowIndex: number, keyId: string): KeyHit => {
    const row = model.rows[rowIndex];
    if (row?.kind !== "property") throw Error("Expected property row");
    return {
      kind: "key",
      rowIndex,
      rowKey: row.key,
      keyId,
      propertyId: row.property.id,
      layerId: row.layer.id,
      trackId: row.track!.id,
      firstKeyIndex: 0,
      afterKeyIndex: 1,
      bounds: { x: 0, y: 0, width: 18, height: 24 },
    };
  };
  return {
    host,
    viewport,
    hit,
    model: () => model,
    replace(next: TimelineCanvasModel) {
      model = next;
    },
  };
}

it("starts at the first populated property without mounting a control for every offscreen key", () => {
  const d = fixture(),
    target = timelineKeyboardTarget(d.host, null, "right");
  expect(target).toMatchObject({
    kind: "key",
    rowIndex: 1,
    rowKey: "position",
    propertyId: "position",
    layerId: "hero",
    trackId: "first",
    keyId: "a",
    firstKeyIndex: 0,
    afterKeyIndex: 1,
  });
  expect(d.host.invalidate).toHaveBeenCalledOnce();
  expect(d.viewport.children).toHaveLength(0);
  const body: TimelineCanvasHit = {
    kind: "clip",
    rowKey: "hero",
    rowIndex: 0,
    layerId: "hero",
    trackId: "first",
    bounds: { x: 0, y: 0, width: 100, height: 24 },
  };
  expect(timelineKeyboardTarget(d.host, body, "down")?.keyId).toBe("a");
  expect(timelineKeyboardTarget(d.host, null, "down")?.keyId).toBe("a");
  expect(timelineKeyboardTarget(d.host, null, "up")).toMatchObject({
    rowIndex: 5,
    keyId: "rotation-0",
  });
});

it("moves left and right inside one property and clamps both ends", () => {
  const d = fixture(),
    first = d.hit(1, "a"),
    last = d.hit(1, "b");
  expect(timelineKeyboardTarget(d.host, first, "left")).toMatchObject({
    keyId: "a",
    rowIndex: 1,
    firstKeyIndex: 0,
    afterKeyIndex: 1,
  });
  expect(timelineKeyboardTarget(d.host, first, "right")).toMatchObject({
    keyId: "b",
    rowIndex: 1,
    firstKeyIndex: 1,
    afterKeyIndex: 2,
  });
  expect(timelineKeyboardTarget(d.host, last, "right")?.keyId).toBe("b");
  expect(timelineKeyboardTarget(d.host, last, "left")?.keyId).toBe("a");
});

it("moves between populated properties, skips layer/empty rows and preserves the temporal search", () => {
  const d = fixture();
  const down = timelineKeyboardTarget(d.host, d.hit(1, "b"), "down");
  // The next property's first key at/after 1 s is its 2 s key, not the earlier 0.5 s key.
  expect(down).toMatchObject({
    rowIndex: 4,
    propertyId: "vertical",
    keyId: "vertical-1",
    firstKeyIndex: 1,
    afterKeyIndex: 2,
  });
  expect(timelineKeyboardTarget(d.host, down, "up")).toMatchObject({ rowIndex: 1, keyId: "b" });
  expect(timelineKeyboardTarget(d.host, down, "down")).toMatchObject({
    rowIndex: 5,
    keyId: "rotation-1",
  });
  expect(timelineKeyboardTarget(d.host, d.hit(1, "a"), "up")?.keyId).toBe("a");
  expect(timelineKeyboardTarget(d.host, d.hit(5, "rotation-1"), "down")?.keyId).toBe("rotation-1");
});

it("scrolls both local axes using the 244 px gutter and 32 px header and returns viewport bounds", () => {
  const d = fixture(),
    layout = vi.spyOn(d.viewport, "getBoundingClientRect");
  const target = timelineKeyboardTarget(d.host, d.hit(1, "b"), "down");
  // clientWidth 344 => time width 100; clientHeight 80 => body height 48.
  expect(d.viewport.scrollLeft).toBe(112);
  expect(d.viewport.scrollTop).toBe(72);
  expect(target?.bounds).toEqual({ x: 79, y: 24, width: 18, height: 24 });
  const back = timelineKeyboardTarget(d.host, target, "up");
  expect(d.viewport.scrollLeft).toBe(88);
  expect(d.viewport.scrollTop).toBe(24);
  expect(back?.bounds).toEqual({ x: 3, y: 0, width: 18, height: 24 });
  timelineKeyboardTarget(d.host, back, "left");
  expect(d.viewport.scrollLeft).toBe(0);
  expect(layout).not.toHaveBeenCalled();
  expect(d.host.invalidate).toHaveBeenCalledTimes(3);
});

it("handles missing keys, empty models, untracked rows and a retired viewport safely", () => {
  const d = fixture(),
    original = d.model();
  expect(timelineKeyboardTarget(d.host, d.hit(1, "removed"), "right")).toMatchObject({
    rowIndex: 4,
    keyId: "vertical-0",
  });
  const outside = { ...d.hit(1, "a"), rowIndex: 999 };
  expect(timelineKeyboardTarget(d.host, outside, "down")).toBeNull();
  const property = d.model().rows[1]!;
  if (property.kind !== "property") throw Error("Expected property row");
  const untracked = { ...property };
  delete untracked.track;
  d.replace({ ...d.model(), rows: [untracked] });
  expect(timelineKeyboardTarget(d.host, null, "right")).toBeNull();
  d.replace({ ...d.model(), rows: [] });
  expect(timelineKeyboardTarget(d.host, null, "left")).toBeNull();
  expect(timelineKeyboardTarget(d.host, null, "up")).toBeNull();
  d.replace(original);
  d.host.viewport.current = null;
  vi.mocked(d.host.invalidate).mockClear();
  expect(timelineKeyboardTarget(d.host, null, "down")).toBeNull();
  expect(d.host.invalidate).not.toHaveBeenCalled();
});

it("reuses key indexes for the same immutable array and rebuilds them after document replacement", () => {
  const d = fixture(),
    model = d.model(),
    row = model.rows[1]!;
  if (row.kind !== "property") throw Error("Expected property row");
  const keys = row.property.keyframes,
    mapped = vi.spyOn(keys, "map");
  const first = timelineKeyboardTarget(d.host, null, "right");
  timelineKeyboardTarget(d.host, first, "right");
  timelineKeyboardTarget(d.host, d.hit(1, "b"), "left");
  expect(mapped).toHaveBeenCalledOnce();
  d.replace({ ...model, rows: model.rows.map((entry) => ({ ...entry })) });
  timelineKeyboardTarget(d.host, d.hit(1, "b"), "left");
  expect(mapped).toHaveBeenCalledOnce();

  const replacement = [
    { ...keys[0]!, id: "inserted", time: { value: 0, rate: 1 } },
    { ...keys[0]!, time: { value: 1, rate: 2 } },
    keys[1]!,
  ];
  const remapped = vi.spyOn(replacement, "map");
  d.replace({
    ...model,
    rows: model.rows.map((entry, index) =>
      index === 1 ? { ...row, property: { ...row.property, keyframes: replacement } } : entry,
    ),
  });
  const replaced = timelineKeyboardTarget(d.host, d.hit(1, "b"), "left");
  expect(replaced).toMatchObject({ keyId: "a", firstKeyIndex: 1, afterKeyIndex: 2 });
  expect(remapped).toHaveBeenCalledOnce();
  timelineKeyboardTarget(d.host, replaced, "right");
  expect(remapped).toHaveBeenCalledOnce();
  expect(mapped).toHaveBeenCalledOnce();
  d.replace(model);
  expect(timelineKeyboardTarget(d.host, d.hit(1, "b"), "left")).toMatchObject({
    keyId: "a",
    firstKeyIndex: 0,
    afterKeyIndex: 1,
  });
  expect(mapped).toHaveBeenCalledOnce();
});
