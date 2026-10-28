import type { Asset, Composition, EnginePort, Layer, Project } from "@musart/core";
import type { PreviewSource, PreviewValue } from "../../state/session/preview-source";
import { createPlaybackSource, type PlaybackSource } from "./playback-source";
import { applyPreview, type LayerPatch } from "../interaction/gestures";

export interface SceneFrame {
  page: Composition;
  assets: Record<string, Asset>;
  playback?: boolean;
}
/** Stable imperative port shared by the GPU adapter and geometry overlays. */
export class SceneController {
  private readonly listeners = new Set<() => void>();
  private stopEngine: (() => void) | null = null;
  private stopPlayback: (() => void) | null = null;
  private readonly playback: PlaybackSource;
  private stopPreview: (() => void) | null = null;
  private patches: LayerPatch[] = [];
  private draft: Layer | null = null;
  private gestureRevision = 0;
  private cached: SceneFrame | null = null;
  private cachedProject: Project | null = null;
  private cachedPageId = "";
  private cachedPreview: PreviewValue | null = null;
  private cachedGesture = -1;
  private published: SceneFrame | null = null;

  constructor(
    private readonly engine: EnginePort,
    private readonly preview: PreviewSource,
  ) {
    this.playback = createPlaybackSource(engine);
  }
  read = (): SceneFrame => {
    const playback = this.playback.read();
    if (playback) return playback;
    const snapshot = this.engine.getSnapshot();
    const preview = this.preview.read();
    if (
      this.cached &&
      this.cachedProject === snapshot.project &&
      this.cachedPageId === snapshot.pageId &&
      this.cachedPreview === preview &&
      this.cachedGesture === this.gestureRevision
    )
      return this.cached;
    const page =
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!;
    const layerPatches =
      preview?.target === "layer"
        ? [...this.patches, preview]
        : preview?.target === "layers"
          ? [
              ...this.patches,
              ...preview.layerIds.map((layerId) => ({ layerId, patch: preview.patch })),
            ]
          : this.patches;
    const next = applyPreview(
      preview?.target === "page" ? { ...page, ...preview.patch } : page,
      layerPatches,
    );
    this.cachedProject = snapshot.project;
    this.cachedPageId = snapshot.pageId;
    this.cachedPreview = preview;
    this.cachedGesture = this.gestureRevision;
    this.cached = {
      page: this.draft ? { ...next, layers: [...next.layers, this.draft] } : next,
      assets: snapshot.project.assets,
    };
    return this.cached;
  };
  private change = () => {
    const next = this.read();
    if (next === this.published) return;
    this.published = next;
    for (const listener of this.listeners) listener();
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.published = this.read();
      this.stopEngine = this.engine.subscribe(this.change);
      this.stopPreview = this.preview.subscribe(this.change);
      this.stopPlayback = this.playback.subscribe(this.change);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopEngine?.();
        this.stopPreview?.();
        this.stopPlayback?.();
        this.stopEngine = null;
        this.stopPreview = null;
        this.stopPlayback = null;
      }
    };
  };
  setGesture(patches: LayerPatch[], draft: Layer | null = null): void {
    if (patches.length === 0 && this.patches.length === 0 && draft === this.draft) return;
    this.patches = patches;
    this.draft = draft;
    this.gestureRevision++;
    this.change();
  }
}
