import { expect, test } from "vitest";
import { createLayer, createPage } from "@musart/core";
import {
  acceptsOccurrencePlacement,
  previewOccurrenceMove,
} from "../../../../src/components/motion/gestures/occurrences";
const t = (value: number) => ({ value, rate: 1 });
test("moves only the chosen bar and its own keys and rejects overlapping v2 previews", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<div class="motion-track-wrap" data-track-id="one"></div><div class="motion-track-wrap" data-track-id="two"></div><button class="motion-key" data-key-id="key1"></button><button class="motion-key" data-key-id="key2"></button>';
  const touched = new Set<HTMLElement>();
  previewOccurrenceMove(root, "two", ["key2"], 40, touched);
  expect([...touched].map((node) => node.dataset.trackId ?? node.dataset.keyId)).toEqual([
    "two",
    "key2",
  ]);
  expect(root.children[0]!.getAttribute("style")).toBeNull();
  const page = createPage({
    layers: [createLayer("rectangle", { id: "hero" })],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: t(4),
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        { id: "one", layerId: "hero", start: t(0), end: t(1), properties: [] },
        { id: "two", layerId: "hero", start: t(2), end: t(3), properties: [] },
      ],
    },
  });
  expect(acceptsOccurrencePlacement(page, page.motion!.tracks[0]!, "move", t(1))).toBe(true);
  expect(acceptsOccurrencePlacement(page, page.motion!.tracks[0]!, "move", t(2))).toBe(false);
  expect(acceptsOccurrencePlacement(page, page.motion!.tracks[0]!, "trimEnd", t(2))).toBe(false);
  page.motion!.version = 1;
  expect(acceptsOccurrencePlacement(page, page.motion!.tracks[0]!, "move", t(2))).toBe(true);
});
