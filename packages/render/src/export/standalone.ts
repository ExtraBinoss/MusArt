import type { Asset, Composition } from "@musart/core";
import { LinearSRGBColorSpace, NoToneMapping, WebGPURenderer } from "three/webgpu";
import { GpuCompositor } from "../compositing/GpuCompositor";
import type { RenderOptions } from "../compositing/types";
import { createSurface } from "../surface/sources";
import { GpuPresentation } from "./presentation";

/** Dedicated export context. One queue covers render, GPU snapshot and all consumers. */
export class StandaloneRenderer {
  private renderer: WebGPURenderer | null = null;
  private compositor: GpuCompositor | null = null;
  private presentation: GpuPresentation | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private disposal: Promise<void> | null = null;
  constructor(
    private readonly forceWebGL?: boolean,
    private readonly maxBytes?: number,
  ) {}
  private async init(): Promise<void> {
    if (this.renderer) return;
    let renderer = new WebGPURenderer({
      alpha: true,
      antialias: false,
      ...(this.forceWebGL === undefined ? {} : { forceWebGL: this.forceWebGL }),
    });
    try {
      await renderer.init();
    } catch {
      await renderer.dispose();
      renderer = new WebGPURenderer({ alpha: true, antialias: false, forceWebGL: true });
      try {
        await renderer.init();
      } catch (error) {
        await renderer.dispose();
        throw error;
      }
    }
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0, 0);
    this.renderer = renderer;
    this.compositor = new GpuCompositor(renderer, { maxBytes: this.maxBytes });
    this.presentation = new GpuPresentation(renderer);
  }
  withCanvasFrame<T>(
    page: Composition,
    assets: Record<string, Asset>,
    consume: (canvas: HTMLCanvasElement) => T | Promise<T>,
    options: RenderOptions = {},
  ): Promise<T> {
    const job = this.queue.then(async () => {
      if (this.disposed) throw new Error("L’export GPU est fermé.");
      await this.init();
      const frame = await this.compositor!.render(page, assets, options);
      this.presentation!.render(frame);
      return consume(this.renderer!.domElement);
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  /** Borrowed GPU canvas: consume it before requesting the next frame, or use withCanvasFrame. */
  render(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions = {},
  ): Promise<HTMLCanvasElement> {
    return this.withCanvasFrame(page, assets, (canvas) => canvas, options);
  }
  snapshot(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions,
  ): Promise<HTMLCanvasElement> {
    return this.withCanvasFrame(
      page,
      assets,
      async (source) => {
        const bitmap = await createImageBitmap(source);
        const canvas = createSurface(source.width, source.height);
        const context = canvas.getContext("bitmaprenderer");
        if (!context) {
          bitmap.close();
          throw new Error("Le transfert GPU de l’export est indisponible.");
        }
        try {
          context.transferFromImageBitmap(bitmap);
        } catch (error) {
          bitmap.close();
          throw error;
        }
        return canvas;
      },
      options,
    );
  }
  stats() {
    return this.compositor?.stats() ?? null;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.queue.then(async () => {
      await this.compositor?.dispose();
      this.presentation?.dispose();
      await this.renderer?.dispose();
      this.renderer = null;
      this.compositor = null;
      this.presentation = null;
    });
    return this.disposal;
  }
}
const renderers = new Map<string, StandaloneRenderer>();
export function snapshotComposition(
  page: Composition,
  assets: Record<string, Asset>,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  const key = String(options.forceWebGL);
  let renderer = renderers.get(key);
  if (!renderer) {
    renderer = new StandaloneRenderer(options.forceWebGL);
    renderers.set(key, renderer);
  }
  return renderer.snapshot(page, assets, options);
}
export async function disposeExportRenderers(): Promise<void> {
  const active = [...renderers.values()];
  renderers.clear();
  await Promise.all(active.map((renderer) => renderer.dispose()));
}

/** Reuses one context, shader graph, geometry and asset cache for an entire video/export job. */
export function createRenderSession(options: RenderOptions & { maxBytes?: number } = {}) {
  return new StandaloneRenderer(options.forceWebGL, options.maxBytes);
}
