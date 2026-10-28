import { GpuCompositor, type FontResolver } from "@musart/render";
import type { Asset, Composition } from "@musart/core";
import {
  DataTexture,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  type Scene,
  type TextureNode,
  type WebGPURenderer,
} from "three/webgpu";
import { texture, uv } from "three/tsl";
import { previewScale } from "./preview-quality";

interface PreviewRequest {
  page: Composition;
  assets: Record<string, Asset>;
  revision: number;
  scale: number;
}
/** Owns one display plane and a latest-only queue. GPU allocation begins at activation. */
export class PlaneResources {
  readonly placeholder = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  readonly sample: TextureNode<"vec4">;
  readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: false,
    blending: NoBlending,
  });
  readonly geometry = new PlaneGeometry(1, 1);
  readonly mesh = new Mesh(this.geometry, this.material);
  private compositor: GpuCompositor | null = null;
  private users = 0;
  private latest: PreviewRequest | null = null;
  private active: Promise<void> | null = null;
  private scheduled = 0;
  private revision = 0;
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private compiled = false;
  private prepared = false;
  private completed = 0;
  private preparedRevision = 0;
  private coalesced = 0;
  private frames = 0;
  private scene: Scene | null = null;
  private camera: OrthographicCamera | null = null;
  private invalidate: () => void = () => undefined;
  private onError?: (message: string) => void;
  private onScale?: (scale: number) => void;
  private density = 1;
  private presentationId: string | null = null;
  private current: { page: Composition; assets: Record<string, Asset> } | null = null;
  private deviceLost = false;
  private stopDeviceEvents: (() => void) | null = null;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly fontResolver?: FontResolver,
  ) {
    this.placeholder.needsUpdate = true;
    this.sample = texture(this.placeholder, uv().flipY());
    this.material.fragmentNode = this.sample;
    this.mesh.visible = false;
  }
  activate(
    scene: Scene,
    camera: OrthographicCamera,
    invalidate: () => void,
    onError?: (message: string) => void,
    onScale?: (scale: number) => void,
  ): () => void {
    if (this.disposed) throw new Error("Aperçu GPU déjà libéré");
    this.users++;
    this.scene = scene;
    this.camera = camera;
    this.invalidate = invalidate;
    this.onError = onError;
    this.onScale = onScale;
    this.stopDeviceEvents ??= this.observeDevice();
    this.compositor ??= this.fontResolver
      ? new GpuCompositor(this.renderer, { fontResolver: this.fontResolver })
      : new GpuCompositor(this.renderer);
    this.renderer.domElement.dataset.backend =
      "isWebGLBackend" in this.renderer.backend && this.renderer.backend.isWebGLBackend
        ? "webgl"
        : "webgpu";
    this.publish();
    this.schedule();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users--;
      if (this.users === 0) {
        if (this.scheduled) {
          cancelAnimationFrame(this.scheduled);
          this.scheduled = 0;
        }
        queueMicrotask(() => {
          if (this.users === 0) void this.dispose().catch((error) => this.report(error));
        });
      }
    };
  }
  submit(page: Composition, assets: Record<string, Asset>) {
    if (this.disposed || this.deviceLost) return;
    this.current = { page, assets };
    if (this.latest) this.coalesced++;
    this.latest = {
      page,
      assets,
      revision: ++this.revision,
      scale: previewScale(page, this.density),
    };
    this.renderer.domElement.dataset.rendererReady = "false";
    this.renderer.domElement.dataset.sceneRevision = String(this.revision);
    delete this.renderer.domElement.dataset.renderError;
    if (this.presentationId !== page.id) {
      this.presentationId = page.id;
      this.renderer.domElement.dataset.compositionPrepared = "false";
      this.renderer.domElement.dataset.presentationReady = "false";
      this.mesh.scale.set(page.width, page.height, 1);
      if (this.camera) {
        Object.assign(this.camera, {
          left: -page.width / 2,
          right: page.width / 2,
          top: page.height / 2,
          bottom: -page.height / 2,
        });
        this.camera.updateProjectionMatrix();
      }
      this.mesh.visible = false;
    }
    this.publish();
    this.schedule();
  }
  /** Navigation changes the raster target density, never font outlines or image uploads. */
  setDensity(density: number): void {
    if (this.disposed || !Number.isFinite(density) || density <= 0 || density === this.density)
      return;
    const before = this.current ? previewScale(this.current.page, this.density) : 1;
    this.density = density;
    if (this.current && before !== previewScale(this.current.page, density))
      this.submit(this.current.page, this.current.assets);
  }
  private schedule() {
    if (
      !this.users ||
      this.scheduled ||
      this.active ||
      !this.latest ||
      this.disposed ||
      this.deviceLost
    )
      return;
    this.scheduled = requestAnimationFrame(() => {
      this.scheduled = 0;
      const request = this.latest;
      if (!request || !this.users || this.disposed || this.deviceLost) return;
      this.latest = null;
      this.active = this.render(request).finally(() => {
        this.active = null;
        this.publish();
        this.schedule();
      });
    });
  }
  private async render(request: PreviewRequest): Promise<void> {
    try {
      const result = await this.compositor!.render(request.page, request.assets, {
        scale: request.scale,
      });
      if (!this.users || this.disposed || this.deviceLost || request.revision !== this.revision)
        return;
      this.sample.value = result.texture;
      this.mesh.scale.set(request.page.width, request.page.height, 1);
      this.onScale?.(request.scale);
      const camera = this.camera!;
      camera.left = -request.page.width / 2;
      camera.right = request.page.width / 2;
      camera.top = request.page.height / 2;
      camera.bottom = -request.page.height / 2;
      camera.updateProjectionMatrix();
      if (!this.compiled) {
        await this.renderer.compileAsync(this.scene!, camera);
        this.compiled = true;
      }
      if (!this.users || this.disposed || this.deviceLost || request.revision !== this.revision)
        return;
      this.completed++;
      this.preparedRevision = request.revision;
      this.renderer.domElement.dataset.renderCount = String(this.completed);
      this.prepared = true;
      this.renderer.domElement.dataset.compositionPrepared = "true";
      this.mesh.visible = true;
      this.renderer.domElement.dataset.pageId = request.page.id;
      this.renderer.domElement.dataset.renderWidth = String(result.width);
      this.renderer.domElement.dataset.renderHeight = String(result.height);
      this.publish();
      this.invalidate();
    } catch (error) {
      if (this.users && !this.disposed && !this.deviceLost && request.revision === this.revision)
        this.report(error);
    }
  }
  /** Marks the prepared texture at its actual scheduled draw. Never starts an animation loop. */
  present() {
    if (this.deviceLost || this.disposed) return;
    this.frames++;
    const element = this.renderer.domElement;
    element.dataset.renderFrames = String(this.frames);
    if (this.prepared && !this.latest && !this.active && element.dataset.rendererReady !== "true") {
      element.dataset.rendererReady = "true";
      element.dataset.presentationReady = "true";
      element.dataset.renderedRevision = String(this.preparedRevision);
      this.publish();
    }
  }
  private publish() {
    const memory = this.renderer.info?.memory;
    this.renderer.domElement.dataset.gpuStats = JSON.stringify({
      ...this.compositor?.stats(),
      ...(memory
        ? {
            uniformBuffers: memory.uniformBuffers,
            uniformBytes: memory.uniformBuffersSize,
            nodePrograms: memory.programs,
            rendererTargets: memory.renderTargets,
          }
        : {}),
      submitted: this.revision,
      completed: this.completed,
      coalesced: this.coalesced,
      displayFrames: this.frames,
      pending: Number(Boolean(this.latest)),
      active: Number(Boolean(this.active)),
    });
  }
  private report(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.renderer.domElement.dataset.renderError = message;
    this.onError?.(message);
  }
  private observeDevice(): () => void {
    const previous = this.renderer.onDeviceLost;
    const lost: WebGPURenderer["onDeviceLost"] = (info) => {
      try {
        // Three must still mark its renderer unusable and preserve its native diagnostic.
        previous?.call(this.renderer, info);
      } finally {
        if (!this.disposed && !this.deviceLost) {
          this.deviceLost = true;
          this.latest = null;
          if (this.scheduled) cancelAnimationFrame(this.scheduled);
          this.scheduled = 0;
          this.renderer.domElement.dataset.rendererReady = "false";
          this.renderer.domElement.dataset.deviceLost = "true";
          const message = `${info.api} device lost: ${info.message}`;
          if (this.users) this.report(new Error(message));
          else this.renderer.domElement.dataset.renderError = message;
          this.publish();
        }
      }
    };
    this.renderer.onDeviceLost = lost;
    return () => {
      if (this.renderer.onDeviceLost === lost) this.renderer.onDeviceLost = previous;
    };
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.stopDeviceEvents?.();
    this.stopDeviceEvents = null;
    this.latest = null;
    this.current = null;
    if (this.scheduled) {
      cancelAnimationFrame(this.scheduled);
      this.scheduled = 0;
    }
    this.disposal = (async () => {
      try {
        const closing = this.compositor?.dispose();
        const results = await Promise.allSettled([this.active, closing]);
        const failed = results.find((result) => result.status === "rejected");
        if (failed)
          throw new Error("Erreur pendant la fermeture de l’aperçu GPU", { cause: failed.reason });
      } finally {
        this.material.dispose();
        this.geometry.dispose();
        this.placeholder.dispose();
        this.mesh.visible = false;
        this.renderer.domElement.dataset.rendererReady = "false";
      }
    })();
    return this.disposal;
  }
}
