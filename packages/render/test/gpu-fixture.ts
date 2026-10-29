import { vi } from "vitest";
import { type Camera, type Scene, type RenderTarget, type WebGPURenderer } from "three/webgpu";
export function makeGpuRenderer() {
  let target: RenderTarget | null = null;
  const canvas = document.createElement("canvas");
  const fake = {
    domElement: canvas,
    backend: { device: { limits: { maxTextureDimension2D: 16384 } } },
    autoClear: true,
    getRenderTarget: vi.fn(() => target),
    setRenderTarget: vi.fn((next: RenderTarget | null) => {
      target = next;
    }),
    render: vi.fn((_scene: Scene, _camera: Camera) => undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    compileAsync: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn((width: number, height: number) => {
      canvas.width = width;
      canvas.height = height;
    }),
    readRenderTargetPixelsAsync: vi.fn(() => {
      throw new Error("Unexpected GPU readback");
    }),
    toneMapping: 0,
    outputColorSpace: "",
  };
  return { fake, renderer: fake as unknown as WebGPURenderer };
}
