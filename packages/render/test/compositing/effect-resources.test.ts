import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { RenderTarget, Texture } from "three/webgpu";
import { EffectResources } from "../../src/compositing/effect-resources";
import { installCanvasMock } from "../canvas-fixture";
import { makeGpuRenderer } from "../gpu-fixture";
beforeEach(() => installCanvasMock());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("shared effect allocations inside the hard cache budget", () => {
  it("predicts scratch and ASCII atlas before allocating and reports actual ownership", () => {
    const { renderer } = makeGpuRenderer();
    const effects = new EffectResources(renderer);
    const source = new Texture();
    const output = new RenderTarget(2, 2);
    const stack = [createEffect("dither"), createEffect("contrast")];
    expect(effects.projectedBytes(2, 2, stack)).toBe(16);
    expect(effects.bytes).toBe(0);
    expect(effects.apply(source, 2, 2, stack, output)).toBe(output.texture);
    expect(effects.bytes).toBe(16);
    expect(effects.targets).toBe(1);
    const ascii = [createEffect("ascii")];
    expect(effects.projectedBytes(2, 2, ascii)).toBe(16 + 16384);
    effects.apply(source, 2, 2, ascii, output);
    expect(effects.bytes).toBe(16 + 16384);
    expect(effects.projectedBytes(3, 2, stack)).toBe(24 + 16384);
    expect(effects.stats().passes).toBe(3);
    expect(effects.projectedBytes(2, 2, [createEffect("ascii", { enabled: false })])).toBe(
      effects.bytes,
    );
    effects.dispose();
    expect(effects.bytes).toBe(0);
  });
  it("accounts for scratch created before a failed draw", () => {
    const { renderer, fake } = makeGpuRenderer();
    const effects = new EffectResources(renderer);
    fake.render.mockImplementationOnce(() => {
      throw new Error("lost");
    });
    expect(() =>
      effects.apply(
        new Texture(),
        2,
        2,
        [createEffect("dither"), createEffect("contrast")],
        new RenderTarget(2, 2),
      ),
    ).toThrow("lost");
    expect(effects.bytes).toBe(16);
    expect(effects.projectedBytes(2, 2, [createEffect("brightness")])).toBe(16);
    effects.dispose();
  });
});

it("passes logical layer dimensions through the shared operator without changing its allocation budget", () => {
  const { renderer } = makeGpuRenderer();
  const effects = new EffectResources(renderer);
  const source = new Texture(),
    output = new RenderTarget(8, 8);
  const stack = [createEffect("grain", { scale: 1 })];
  expect(effects.apply(source, 8, 8, stack, output, { width: 31.25, height: 23.5 })).toBe(
    output.texture,
  );
  expect(effects.bytes).toBe(0);
  expect(effects.stats().passes).toBe(1);
  effects.dispose();
  source.dispose();
  output.dispose();
});
