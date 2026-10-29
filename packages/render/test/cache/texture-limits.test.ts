import { expect, it, vi } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { assertTextureSize, gpuTextureLimit } from "../../src/cache/texture-limits";
it("queries each acquired context once and refreshes when the actual device/context identity changes", () => {
  const gl = { MAX_TEXTURE_SIZE: 3379, getParameter: vi.fn(() => 4096) },
    other = { MAX_TEXTURE_SIZE: 3379, getParameter: vi.fn(() => 2048) },
    backend: { gl?: typeof gl; device?: { limits: { maxTextureDimension2D: number } } } = { gl },
    renderer = { backend } as unknown as WebGPURenderer;
  expect(gpuTextureLimit(renderer)).toBe(4096);
  expect(gpuTextureLimit(renderer)).toBe(4096);
  expect(gl.getParameter).toHaveBeenCalledOnce();
  backend.gl = other;
  expect(gpuTextureLimit(renderer)).toBe(2048);
  expect(other.getParameter).toHaveBeenCalledOnce();
  backend.device = { limits: { maxTextureDimension2D: 8192 } };
  expect(gpuTextureLimit(renderer)).toBe(8192);
  backend.device = { limits: { maxTextureDimension2D: 16384 } };
  expect(gpuTextureLimit(renderer)).toBe(16384);
});

it("uses acquired device limits and the actual fallback GL context rather than an adapter maximum", () => {
  const getContext = vi.fn();
  expect(
    gpuTextureLimit({
      backend: { device: { limits: { maxTextureDimension2D: 8192 } } },
      getContext,
    } as unknown as WebGPURenderer),
  ).toBe(8192);
  expect(getContext).not.toHaveBeenCalled();
  const gl = { MAX_TEXTURE_SIZE: 3379, getParameter: vi.fn(() => 4096) };
  expect(gpuTextureLimit({ backend: { gl }, getContext } as unknown as WebGPURenderer)).toBe(4096);
  expect(gl.getParameter).toHaveBeenCalledWith(3379);
  getContext.mockReturnValue(gl);
  expect(gpuTextureLimit({ backend: {}, getContext } as unknown as WebGPURenderer)).toBe(4096);
});
it("rejects unavailable capabilities and each oversized axis before any GPU allocation", () => {
  for (const limit of [0, NaN, Infinity, 1.5, undefined])
    expect(() =>
      gpuTextureLimit({
        backend: { device: { limits: { maxTextureDimension2D: limit } } },
      } as unknown as WebGPURenderer),
    ).toThrow("initialization");
  for (const context of [
    null,
    {},
    { MAX_TEXTURE_SIZE: 3379, getParameter: "invalid" },
    { MAX_TEXTURE_SIZE: 3379, getParameter: () => 0 },
  ])
    expect(() =>
      gpuTextureLimit({ backend: {}, getContext: () => context } as unknown as WebGPURenderer),
    ).toThrow("initialization");
  expect(() => assertTextureSize(8192, 1, 8192)).not.toThrow();
  expect(() => assertTextureSize(1, 8192, 8192)).not.toThrow();
  for (const [width, height] of [
    [8193, 1],
    [1, 8193],
  ])
    expect(() => assertTextureSize(width!, height!, 8192)).toThrow("device limit");
  for (const [width, height] of [
    [0, 1],
    [1, -1],
    [Infinity, 1],
    [1, NaN],
    [0.5, 1],
  ])
    expect(() => assertTextureSize(width!, height!, 8192)).toThrow("dimensions");
  expect(() => assertTextureSize(1, 1, 0)).toThrow("initialization");
});
