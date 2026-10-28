import { GpuCompositor, type FontResolver, type FrameTexture } from "@musart/render";
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
import { syncArtboardBackdrops } from "../artboards/backdrop-presentation";
import type {
  CanonicalOrigin,
  PresentationPublisher,
  PresentationTicket,
} from "../../state/session/canonical-presentation";

interface PresentationInput {
  origin: CanonicalOrigin;
  canonical: boolean;
}

interface PreviewRequest {
  page: Composition;
  assets: Record<string, Asset>;
  revision: number;
  scale: number;
  ticket?: PresentationTicket;
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
  private presentationProjectId: string | undefined;
  private current: {
    page: Composition;
    assets: Record<string, Asset>;
    presentation?: PresentationInput;
  } | null = null;
  private deviceLost = false;
  private stopDeviceEvents: (() => void) | null = null;
  private presenter: PresentationPublisher | undefined;
  private preparedTicket: PresentationTicket | undefined;
  private presentationScene: Scene | null = null;
  private stopSceneEvents: (() => void) | null = null;

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
    presenter?: PresentationPublisher,
  ): () => void {
    if (this.disposed) throw new Error("Aperçu GPU déjà libéré");
    this.users++;
    this.scene = scene;
    this.camera = camera;
    this.invalidate = invalidate;
    this.onError = onError;
    this.onScale = onScale;
    this.presenter = presenter;
    this.stopDeviceEvents ??= this.observeDevice();
    if (this.presentationScene !== scene) {
      this.stopSceneEvents?.();
      this.presentationScene = scene;
      const callbacks: { onAfterRender: Scene["onAfterRender"] } = scene;
      const previous = callbacks.onAfterRender;
      const after: Scene["onAfterRender"] = (...args) => {
        try {
          previous.apply(scene, args);
        } finally {
          if ((args[0] as unknown) === this.renderer && this.renderer.getRenderTarget() === null)
            this.present();
        }
      };
      callbacks.onAfterRender = after;
      this.stopSceneEvents = () => {
        if (callbacks.onAfterRender === after) callbacks.onAfterRender = previous;
      };
    }
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
  submit(page: Composition, assets: Record<string, Asset>, presentation?: PresentationInput) {
    if (this.disposed || this.deviceLost) return;
    this.current = { page, assets, ...(presentation ? { presentation } : {}) };
    if (this.latest) this.coalesced++;
    this.latest = {
      page,
      assets,
      revision: ++this.revision,
      scale: previewScale(page, this.density),
      ...(presentation && this.presenter
        ? { ticket: this.presenter.request(presentation.origin, presentation.canonical) }
        : {}),
    };
    this.renderer.domElement.dataset.rendererReady = "false";
    this.renderer.domElement.dataset.sceneRevision = String(this.revision);
    delete this.renderer.domElement.dataset.renderError;
    if (
      this.presentationId !== page.id ||
      this.presentationProjectId !== presentation?.origin.projectId
    ) {
      this.presentationId = page.id;
      this.presentationProjectId = presentation?.origin.projectId;
      this.prepared = false;
      this.preparedTicket = undefined;
      this.renderer.domElement.dataset.compositionPrepared = "false";
      this.renderer.domElement.dataset.presentationReady = "false";
      // The stable destination backdrop stays visible until this canvas contains its own page.
      this.renderer.domElement.style.visibility = "hidden";
      syncArtboardBackdrops(this.renderer.domElement.closest(".editor-canvas"));
      this.mesh.visible = false;
      this.compositor?.releasePresentation();
    }
    const retained =
      this.users > 0 &&
      this.compiled &&
      this.compositor?.retainedFrame(page, assets, this.latest.scale);
    if (retained) {
      const request = this.latest;
      this.latest = null;
      if (this.scheduled) cancelAnimationFrame(this.scheduled);
      this.scheduled = 0;
      this.bindFrame(request, retained);
      if (!this.users || this.disposed || this.deviceLost || request.revision !== this.revision)
        return;
      this.preparedFrame(request, retained);
      return;
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
      this.submit(this.current.page, this.current.assets, this.current.presentation);
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
        canRender: () =>
          Boolean(
            this.users && !this.disposed && !this.deviceLost && request.revision === this.revision,
          ),
      });
      if (!this.users || this.disposed || this.deviceLost || request.revision !== this.revision)
        return;
      this.bindFrame(request, result);
      const camera = this.camera!;
      if (!this.compiled) {
        await this.renderer.compileAsync(this.scene!, camera);
        this.compiled = true;
      }
      if (!this.users || this.disposed || this.deviceLost || request.revision !== this.revision)
        return;
      this.preparedFrame(request, result);
    } catch (error) {
      if (this.users && !this.disposed && !this.deviceLost && request.revision === this.revision)
        this.report(error);
    }
  }
  private bindFrame(request: PreviewRequest, result: FrameTexture): void {
    this.sample.value = result.texture;
    this.mesh.scale.set(request.page.width, request.page.height, 1);
    const camera = this.camera!;
    camera.left = -request.page.width / 2;
    camera.right = request.page.width / 2;
    camera.top = request.page.height / 2;
    camera.bottom = -request.page.height / 2;
    camera.updateProjectionMatrix();
    this.onScale?.(request.scale);
  }
  private preparedFrame(request: PreviewRequest, result: FrameTexture): void {
    this.completed++;
    this.preparedRevision = request.revision;
    this.preparedTicket = request.ticket;
    this.renderer.domElement.dataset.renderCount = String(this.completed);
    this.prepared = true;
    this.renderer.domElement.dataset.compositionPrepared = "true";
    this.mesh.visible = true;
    this.renderer.domElement.dataset.pageId = request.page.id;
    if (this.presentationProjectId)
      this.renderer.domElement.dataset.projectId = this.presentationProjectId;
    else delete this.renderer.domElement.dataset.projectId;
    this.renderer.domElement.dataset.renderWidth = String(result.width);
    this.renderer.domElement.dataset.renderHeight = String(result.height);
    this.publish();
    this.invalidate();
  }
  /** Called after Three finishes the display scene's render pass, never before the draw. */
  present() {
    if (!this.users || this.deviceLost || this.disposed) return;
    this.frames++;
    const element = this.renderer.domElement;
    element.dataset.renderFrames = String(this.frames);
    if (
      this.prepared &&
      this.preparedRevision === this.revision &&
      element.dataset.rendererReady !== "true"
    ) {
      element.dataset.rendererReady = "true";
      element.dataset.presentationReady = "true";
      element.dataset.displayInitialized = "true";
      element.style.visibility = "visible";
      syncArtboardBackdrops(element.closest(".editor-canvas"));
      element.dataset.renderedRevision = String(this.preparedRevision);
      if (this.preparedTicket) {
        this.presenter?.present(this.preparedTicket);
        if (this.preparedTicket.canonical)
          element.dataset.canonicalRevision = String(this.preparedTicket.revision);
        if (this.preparedTicket.canonical)
          element.dataset.canonicalPresentedAt = String(performance.now());
      }
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
    this.presenter?.unavailable();
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
    this.stopSceneEvents?.();
    this.stopSceneEvents = null;
    this.presenter = undefined;
    this.preparedTicket = undefined;
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
        this.renderer.domElement.style.visibility = "hidden";
        this.renderer.domElement.dataset.rendererReady = "false";
        syncArtboardBackdrops(this.renderer.domElement.closest(".editor-canvas"));
      }
    })();
    return this.disposal;
  }
}
