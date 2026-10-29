import { expect, it } from "vitest";
import { EditorEngine } from "@musart/core";
import {
  clampTimelineHeight,
  readTimelineHeight,
  rememberTimelineHeight,
} from "../../../src/components/motion/height";

it("starts proportionally instead of consuming nearly half of a small desktop viewport", () => {
  const engine = new EditorEngine();
  expect(readTimelineHeight(engine, 720)).toBe(230);
  expect(readTimelineHeight(engine, 800)).toBe(256);
  expect(readTimelineHeight(engine, 1000)).toBe(316);
  expect(readTimelineHeight(engine, 500)).toBe(200);
  expect(Number.isFinite(readTimelineHeight(engine, NaN))).toBe(true);
});

it("retains a manual ratio across reopening/resizing without sharing it with another session", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine();
  rememberTimelineHeight(engine, 400, 1000);
  expect(readTimelineHeight(engine, 720)).toBe(288);
  expect(readTimelineHeight(engine, 1000)).toBe(400);
  expect(readTimelineHeight(other, 1000)).toBe(316);
  expect(clampTimelineHeight(9999, 720)).toBe(468);
  expect(clampTimelineHeight(0, 720)).toBe(164);
  expect(Number.isFinite(clampTimelineHeight(NaN, NaN))).toBe(true);
});
