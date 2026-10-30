import { afterEach, expect, it, vi } from "vitest";
import {
  bankShapes,
  decodePeaks,
  mountainPath,
  closeAtlas,
} from "../../../../../src/services/motion/audio/bank/geometry";
import { generateBankShapes } from "../../../../../../../scripts/audio/bank";
afterEach(() => vi.unstubAllGlobals());
it("validates the complete recipe/hash table and rejects stale or incomplete shapes", () => {
  const data = generateBankShapes();
  expect(bankShapes(data)).toBe(data);
  expect(decodePeaks(data.shapes[0]!)).toHaveLength(96);
  for (const invalid of [
    { ...data, recipeVersion: -1 },
    { ...data, shapes: [] },
    { ...data, shapes: [{ ...data.shapes[0], frames: 1 }, ...data.shapes.slice(1)] },
    { ...data, shapes: [{ ...data.shapes[0], peaks: "" }, ...data.shapes.slice(1)] },
  ])
    expect(() => bankShapes(invalid)).toThrow();
});
it("fills a one-sided mountain from its baseline and closes both bitmap owners", () => {
  const calls: unknown[][] = [];
  class Path {
    moveTo(...p: unknown[]) {
      calls.push(["move", ...p]);
    }
    lineTo(...p: unknown[]) {
      calls.push(["line", ...p]);
    }
    quadraticCurveTo(...p: unknown[]) {
      calls.push(["curve", ...p]);
    }
    closePath() {
      calls.push(["close"]);
    }
  }
  vi.stubGlobal("Path2D", Path);
  mountainPath([0, 0.3, 1, 0.4, 0], 128, 16);
  expect(calls[0]).toEqual(["move", 0, 15.5]);
  expect(calls.at(-2)).toEqual(["line", 128, 15.5]);
  expect(calls.at(-1)).toEqual(["close"]);
  expect(calls.some((call) => call[0] === "curve")).toBe(true);
  const atlas = { neutral: { close: vi.fn() }, active: { close: vi.fn() } };
  closeAtlas(atlas as never);
  expect(atlas.neutral.close).toHaveBeenCalledOnce();
  expect(atlas.active.close).toHaveBeenCalledOnce();
});
