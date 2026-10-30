import { expect, test } from "vitest";
import { createLayer, createPage } from "../../src/document/factories";
import { createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import { freezeValue } from "../../src/document/immutable";
import {
  getMotionOccurrenceAt,
  listLayerMotionOccurrences,
  resolveMotionOccurrence,
} from "../../src/motion/occurrences";
const time = (value: number, rate = 1) => ({ value, rate });
function fixture() {
  return createPage({
    layers: [createLayer("rectangle", { id: "hero" })],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: time(4),
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        { id: "later", layerId: "hero", start: time(2), end: null, properties: [] },
        { id: "early", layerId: "hero", start: time(0), end: time(1), properties: [] },
      ],
    },
  });
}
test("groups by canonical layer, sorts without mutation and resolves only covering intervals", () => {
  const page = fixture();
  expect(listLayerMotionOccurrences(page, "hero").map((track) => track.id)).toEqual([
    "early",
    "later",
  ]);
  expect(page.motion!.tracks[0]!.id).toBe("later");
  expect(getMotionOccurrenceAt(page, "hero", time(100, 100))).toBeUndefined();
  expect(getMotionOccurrenceAt(page, "hero", time(4, 2))?.id).toBe("later");
  expect(getMotionOccurrenceAt(page, "hero", time(4))).toBeUndefined();
  expect(getMotionOccurrenceAt(page, "hero", time(4), { terminalPreview: true })?.id).toBe("later");
  expect(listLayerMotionOccurrences(page, "missing")).toEqual([]);
  expect(() => getMotionOccurrenceAt(page, "hero", time(NaN))).toThrow();
});
test("explicit ownership and unique time resolution prevent first-occurrence fallbacks", () => {
  const page = fixture();
  expect(resolveMotionOccurrence(page, "hero", "early").id).toBe("early");
  expect(resolveMotionOccurrence(page, "hero", undefined, time(3)).id).toBe("later");
  expect(() => resolveMotionOccurrence(page, "hero")).toThrow("Choose a Motion occurrence");
  expect(() => resolveMotionOccurrence(page, "hero", undefined, time(3, 2))).toThrow();
  expect(() => resolveMotionOccurrence(page, "missing", "early")).toThrow();
  expect(() => resolveMotionOccurrence(page, "hero", "")).toThrow();
});

test("retains a frozen index only for certified published compositions and invalidates by revision", () => {
  const engine = new EditorEngine(createProject({ pages: [fixture()] }));
  const first = engine.getSnapshot().project.pages[0]!;
  const indexed = listLayerMotionOccurrences(first, "hero");
  expect(listLayerMotionOccurrences(first, "hero")).toBe(indexed);
  expect(Object.isFrozen(indexed)).toBe(true);
  engine.execute({
    type: "setMotionTrackRange",
    trackId: "early",
    start: time(0),
    end: time(3, 2),
  });
  const second = engine.getSnapshot().project.pages[0]!;
  expect(listLayerMotionOccurrences(second, "hero")).not.toBe(indexed);
  expect(getMotionOccurrenceAt(second, "hero", time(5, 4))?.id).toBe("early");
  expect(getMotionOccurrenceAt(first, "hero", time(5, 4))).toBeUndefined();
});

test("mutable drafts and arbitrary frozen objects never retain stale occurrence indexes", () => {
  const draft = fixture();
  const before = listLayerMotionOccurrences(draft, "hero");
  draft.motion!.tracks[1]!.end = time(3, 2);
  expect(getMotionOccurrenceAt(draft, "hero", time(5, 4))?.id).toBe("early");
  expect(listLayerMotionOccurrences(draft, "hero")).not.toBe(before);
  Object.freeze(draft);
  const shallow = listLayerMotionOccurrences(draft, "hero");
  draft.motion!.tracks[1]!.start = time(1, 2);
  expect(listLayerMotionOccurrences(draft, "hero")).not.toBe(shallow);
  expect(getMotionOccurrenceAt(draft, "hero", time(1, 4))).toBeUndefined();
  const frozen = freezeValue(fixture());
  expect(listLayerMotionOccurrences(frozen, "hero")).not.toBe(
    listLayerMotionOccurrences(frozen, "hero"),
  );
});
