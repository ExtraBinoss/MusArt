import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import {
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  TextureNode,
  RenderTarget,
  Texture,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { GpuEffects } from "../../src/effects/GpuEffects";
import { installCanvasMock } from "../canvas-fixture";

function renderer(previous: RenderTarget | null = null) {
  return {
    backend: { device: { limits: { maxTextureDimension2D: 16384 } } },
    getRenderTarget: vi.fn(() => previous),
    setRenderTarget: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(() => {
      throw new Error("Forbidden GPU readback");
    }),
    readRenderTargetPixels: vi.fn(() => {
      throw new Error("Forbidden GPU readback");
    }),
    dispose: vi.fn(),
    init: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
  };
}
function setup() {
  const backend = renderer();
  const gpu = new GpuEffects(backend as unknown as WebGPURenderer);
  const source = new Texture();
  const output = new RenderTarget(2, 2);
  return {
    backend,
    gpu,
    source,
    output,
    dispose: () => {
      gpu.dispose();
      source.dispose();
      output.dispose();
    },
  };
}
it("checks the real device's axis limit before resizing output or allocating intermediate passes", () => {
  const backend = renderer();
  backend.backend.device.limits.maxTextureDimension2D = 64;
  const gpu = new GpuEffects(backend as unknown as WebGPURenderer),
    source = new Texture(),
    output = new RenderTarget(2, 2),
    resize = vi.spyOn(output, "setSize");
  const effects = [createEffect("brightness"), createEffect("contrast")];
  expect(() => gpu.projectedBytes(65, 1, effects)).toThrow("device limit");
  expect(() => gpu.apply(source, 1, 65, effects, output)).toThrow("device limit");
  expect(resize).not.toHaveBeenCalled();
  expect(backend.render).not.toHaveBeenCalled();
  expect(gpu.stats()).toMatchObject({ targets: 0, materials: 0, bytes: 0 });
  expect(
    gpu.apply(
      source,
      65,
      1,
      effects.map((effect) => ({ ...effect, enabled: false })),
      output,
    ),
  ).toBe(source);
  gpu.apply(source, 32, 1, effects, output);
  expect(gpu.stats().passes).toBe(2);
  gpu.dispose();
  source.dispose();
  output.dispose();
});
let canvasContext: ReturnType<typeof installCanvasMock>;
beforeEach(() => {
  canvasContext = installCanvasMock();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("shared-renderer GPU effect operator", () => {
  it("returns source textures for disabled stacks without targets, drawing or atlas uploads", () => {
    const fixture = setup();
    const { gpu, source, output, backend } = fixture;
    expect(gpu.apply(source, 2, 2, [createEffect("dither", { enabled: false })], output)).toBe(
      source,
    );
    expect(gpu.apply(source, 2, 2, [], output)).toBe(source);
    expect(gpu.stats()).toEqual({ passes: 0, targets: 0, bytes: 0, materials: 0 });
    expect(backend.render).not.toHaveBeenCalled();
    expect(backend.init).not.toHaveBeenCalled();
    fixture.dispose();
  });
  it("runs three ordered passes entirely on GPU and leaves a caller-owned durable output", () => {
    const fixture = setup();
    const { gpu, source, output, backend } = fixture;
    const putImageData = canvasContext.putImageData;
    expect(
      gpu.apply(
        source,
        2,
        2,
        [createEffect("dither"), createEffect("ascii"), createEffect("contrast")],
        output,
      ),
    ).toBe(output.texture);
    const targets = backend.setRenderTarget.mock.calls.slice(0, -1).map((call) => call[0]);
    expect(targets[0]).toBe(output);
    expect(targets[2]).toBe(output);
    expect(targets[1]).toBeInstanceOf(RenderTarget);
    expect(targets[1]).not.toBe(output);
    expect(backend.setRenderTarget).toHaveBeenLastCalledWith(null);
    expect(gpu.stats()).toEqual({ passes: 3, targets: 1, bytes: 16 + 256 * 16 * 4, materials: 3 });
    expect(backend.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    expect(backend.readRenderTargetPixels).not.toHaveBeenCalled();
    expect(putImageData).not.toHaveBeenCalled();
    const second = new RenderTarget(2, 2);
    const firstDispose = vi.spyOn(output, "dispose");
    gpu.apply(source, 2, 2, [createEffect("brightness")], second);
    expect(firstDispose).not.toHaveBeenCalled();
    expect(second.texture).not.toBe(output.texture);
    expect(backend.setRenderTarget.mock.calls.at(-2)?.[0]).toBe(second);
    gpu.dispose();
    expect(firstDispose).not.toHaveBeenCalled();
    expect(backend.dispose).not.toHaveBeenCalled();
    expect(gpu.stats()).toEqual({ passes: 4, targets: 0, bytes: 0, materials: 0 });
    second.dispose();
    source.dispose();
    output.dispose();
  });
  it("chooses even-stack parity so its second pass finishes in output with one reusable scratch", () => {
    const fixture = setup();
    const { gpu, source, output, backend } = fixture;
    gpu.apply(source, 10, 20, [createEffect("dither"), createEffect("grayscale")], output);
    const scratch = backend.setRenderTarget.mock.calls[0]![0] as RenderTarget;
    expect(scratch).not.toBe(output);
    expect(backend.setRenderTarget.mock.calls[1]?.[0]).toBe(output);
    expect(output.width).toBe(10);
    expect(output.height).toBe(20);
    expect(gpu.stats().bytes).toBe(10 * 20 * 4);
    gpu.apply(source, 4, 5, [createEffect("contrast"), createEffect("blur")], output);
    expect(backend.setRenderTarget.mock.calls[3]?.[0]).toBe(scratch);
    expect(scratch.width).toBe(4);
    expect(scratch.height).toBe(5);
    expect(gpu.stats().targets).toBe(1);
    expect(gpu.stats().bytes).toBe(4 * 5 * 4);
    fixture.dispose();
  });
  it("reuses one material per effect type across color toggles, numeric edits and different source textures", () => {
    const fixture = setup();
    const { gpu, source, output, backend } = fixture;
    const materials: MeshBasicNodeMaterial[] = [];
    backend.render.mockImplementation((scene: Scene) => {
      const mesh = scene.children[0];
      expect(mesh).toBeInstanceOf(Mesh);
      if (mesh instanceof Mesh) materials.push(mesh.material as MeshBasicNodeMaterial);
    });
    const effect = createEffect("dither", { color: false, amount: 0.3 });
    gpu.apply(source, 2, 2, [effect], output);
    const key = materials[0]!.fragmentNode!.getCacheKey();
    const nextSource = new Texture();
    gpu.apply(
      nextSource,
      2,
      2,
      [{ ...effect, color: true, amount: 0.8, scale: 4, levels: 12, seed: 7 }],
      output,
    );
    expect(materials[1]).toBe(materials[0]);
    expect(materials[1]!.fragmentNode!.getCacheKey()).toBe(key);
    expect(gpu.stats().materials).toBe(1);
    gpu.apply(nextSource, 2, 2, [createEffect("ascii", { color: false })], output);
    gpu.apply(nextSource, 2, 2, [createEffect("ascii", { color: true })], output);
    expect(materials[2]).toBe(materials[3]);
    expect(gpu.stats().materials).toBe(2);
    nextSource.dispose();
    fixture.dispose();
  });
  it("restores an existing render target on shader or draw failures and supports later retries", () => {
    const previous = new RenderTarget(1, 1);
    const backend = renderer(previous);
    const gpu = new GpuEffects(backend as unknown as WebGPURenderer);
    const source = new Texture();
    const output = new RenderTarget(2, 2);
    backend.render.mockImplementationOnce(() => {
      throw new Error("device lost");
    });
    expect(() => gpu.apply(source, 2, 2, [createEffect("blur")], output)).toThrow("device lost");
    expect(backend.setRenderTarget).toHaveBeenLastCalledWith(previous);
    expect(gpu.stats().passes).toBe(0);
    expect(gpu.apply(source, 2, 2, [createEffect("blur")], output)).toBe(output.texture);
    expect(gpu.stats().passes).toBe(1);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    expect(() => gpu.apply(source, 2, 2, [createEffect("ascii")], output)).toThrow("ASCII");
    expect(backend.setRenderTarget).toHaveBeenLastCalledWith(previous);
    expect(gpu.apply(source, 2, 2, [createEffect("ascii")], output)).toBe(output.texture);
    gpu.dispose();
    source.dispose();
    output.dispose();
    previous.dispose();
  });
  it("keeps Gradient stages, original coverage backups and atlas inside a bounded shared GPU allocation", () => {
    const f = setup(),
      stages: { source: Texture; backdrop: Texture; target: Texture }[] = [];
    f.backend.render.mockImplementation((scene: Scene) => {
      const mesh = scene.children[0] as Mesh<PlaneGeometry, MeshBasicNodeMaterial>;
      const passes = (
        f.gpu as unknown as {
          passes: Map<
            string,
            {
              material: MeshBasicNodeMaterial;
              source: TextureNode<"vec4">;
              backdrop: TextureNode<"vec4">;
            }
          >;
        }
      ).passes;
      const pass = [...passes.values()].find((entry) => entry.material === mesh.material)!;
      const target = f.backend.setRenderTarget.mock.calls.at(-1)![0] as RenderTarget;
      stages.push({
        source: pass.source.value,
        backdrop: pass.backdrop.value,
        target: target.texture,
      });
      expect(pass.source.value).not.toBe(target.texture);
      expect(pass.backdrop.value).not.toBe(target.texture);
    });
    const gradient = createEffect("gradient", { settings: { treatment: "glass" } }),
      stack = [createEffect("brightness"), gradient];
    expect(f.gpu.projectedBytes(8, 6, stack)).toBe(8 * 6 * 8);
    f.gpu.apply(f.source, 8, 6, stack, f.output);
    expect(stages).toHaveLength(5); // brightness + durable original copy + field/treatment/finish
    expect(stages.at(-1)?.target).toBe(f.output.texture);
    expect(stages.at(-1)?.backdrop).toBe(stages[1]?.target);
    expect(f.gpu.stats()).toMatchObject({ targets: 2, bytes: 8 * 6 * 8, materials: 5 });
    const ascii = { ...gradient, settings: { treatment: "ascii" as const } };
    expect(f.gpu.projectedBytes(8, 6, [ascii])).toBe(8 * 6 * 8 + 16384);
    f.gpu.apply(f.source, 8, 6, [ascii], f.output);
    for (let i = 0; i < 50; i++)
      f.gpu.apply(
        f.source,
        8,
        6,
        [
          {
            ...gradient,
            time: i,
            settings: { treatment: "glass", style: i % 2 ? "mesh" : "silk" },
          },
        ],
        f.output,
      );
    expect(f.gpu.stats()).toMatchObject({ targets: 2, materials: 6, bytes: 8 * 6 * 8 + 16384 });
    f.gpu.apply(f.source, 8, 6, [{ ...gradient, blendMode: "multiply" }], f.output);
    f.gpu.apply(f.source, 8, 6, [{ ...gradient, blendMode: "screen", composite: "xor" }], f.output);
    expect(f.gpu.stats().materials).toBe(7);
    expect(f.backend.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    f.dispose();
    expect(f.gpu.stats()).toMatchObject({ targets: 0, materials: 0, bytes: 0 });
  });
  it("rejects feedback loops, malformed dimensions, unsupported types and reuse after disposal", () => {
    const fixture = setup();
    const { gpu, source, output } = fixture;
    expect(() => gpu.apply(output.texture, 2, 2, [createEffect("dither")], output)).toThrow(
      "distinctes",
    );
    for (const [width, height] of [
      [0, 1],
      [1, 0],
      [1.5, 1],
      [1, Infinity],
    ])
      expect(() => gpu.apply(source, width, height, [], output)).toThrow("Dimensions");
    expect(() =>
      gpu.apply(source, 2, 2, [{ ...createEffect("dither"), type: "unknown" as never }], output),
    ).toThrow("inconnu");
    expect(() =>
      gpu.apply(source, 2, 2, [{ ...createEffect("dither"), type: "toString" as never }], output),
    ).toThrow("inconnu");
    gpu.dispose();
    gpu.dispose();
    expect(() => gpu.apply(source, 2, 2, [], output)).toThrow("fermé");
    source.dispose();
    output.dispose();
  });
  it.each([false, true])(
    "normalizes render-target UVs per pass on both renderer backends (webgl=%s)",
    (webgl) => {
      const backend = renderer();
      Object.assign(backend.backend, { isWebGLBackend: webgl });
      const gpu = new GpuEffects(backend as unknown as WebGPURenderer);
      const source = new Texture();
      const output = new RenderTarget(2, 2);
      const orientations: number[] = [];
      const materials: MeshBasicNodeMaterial[] = [];
      backend.render.mockImplementation((scene: Scene) => {
        const mesh = scene.children[0];
        if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshBasicNodeMaterial))
          throw new Error("Expected effect pass");
        materials.push(mesh.material);
        const values = new Set<number>();
        // Effect output is now a runtime compositing Fn. Inspect its stable controls,
        // while browser decoded-pixel tests prove the generated WGSL/GLSL orientation.
        const passes = (
          gpu as unknown as {
            passes: Map<
              string,
              { controls: { sourceFlipY: { value: number }; backdropFlipY: { value: number } } }
            >;
          }
        ).passes;
        const controls = passes.get("brightness")!.controls;
        values.add(controls.sourceFlipY.value);
        expect(controls.backdropFlipY.value).toBe(controls.sourceFlipY.value);
        expect(values.size).toBe(1);
        orientations.push([...values][0]!);
      });
      const effect = createEffect("brightness");
      gpu.apply(source, 2, 2, [effect, effect, effect], output);
      expect(orientations).toEqual([0, 1, 1]);
      expect(materials[0]).toBe(materials[1]);
      expect(materials[1]).toBe(materials[2]);
      const nextOutput = new RenderTarget(2, 2);
      gpu.apply(output.texture, 2, 2, [effect], nextOutput);
      expect(orientations.at(-1)).toBe(1);
      expect(materials[3]).toBe(materials[0]);
      gpu.dispose();
      source.dispose();
      output.dispose();
      nextOutput.dispose();
    },
  );
});

it.each([
  { width: 0, height: 1 },
  { width: 1, height: -1 },
  { width: Number.NaN, height: 1 },
  { width: 1, height: Number.POSITIVE_INFINITY },
])("rejects invalid authored effect dimensions before GPU submission: %j", (logical) => {
  const d = setup();
  expect(() => d.gpu.apply(d.source, 4, 4, [createEffect("grain")], d.output, logical)).toThrow(
    "logical effect dimensions",
  );
  expect(d.backend.render).not.toHaveBeenCalled();
  d.dispose();
});
