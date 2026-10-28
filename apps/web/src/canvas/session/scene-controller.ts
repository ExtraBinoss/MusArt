import type { Asset, Composition, EnginePort, Layer, Project } from "@musart/core";
import type { PreviewSource, PreviewValue } from "../../state/session/preview-source";
import { createPlaybackSource, type PlaybackSource, type PlaybackFrame } from "./playback-source";
import { applyPreview, type LayerPatch } from "../interaction/gestures";
import {
  getCanonicalPresentation,
  type CanonicalOrigin,
} from "../../state/session/canonical-presentation";

export interface SceneFrame {
  page: Composition;
  assets: Record<string, Asset>;
  playback?: boolean;
  presentation?: { origin: CanonicalOrigin; canonical: boolean };
}
/** Stable imperative port shared by the GPU adapter and geometry overlays. */
export class SceneController {
  readonly presentation: ReturnType<typeof getCanonicalPresentation>;
  private readonly listeners = new Set<() => void>();
  private stopEngine: (() => void) | null = null;
  private stopPlayback: (() => void) | null = null;
  private readonly playback: PlaybackSource;
  private cachedPlayback: { source: PlaybackFrame; frame: SceneFrame } | null = null;
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
    this.presentation = getCanonicalPresentation(engine);
    this.playback = createPlaybackSource(engine);
  }
  read = (): SceneFrame => {
    const playback = this.playback.read();
    if (playback) {
      if (this.cachedPlayback?.source !== playback) {
        const snapshot = this.engine.getSnapshot();
        this.cachedPlayback = {
          source: playback,
          frame: {
            ...playback,
            presentation: {
              origin: { projectId: snapshot.project.id, revision: snapshot.revision },
              canonical: false,
            },
          },
        };
      }
      return this.cachedPlayback.frame;
    }
    this.cachedPlayback = null;
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
      presentation: {
        origin: { projectId: snapshot.project.id, revision: snapshot.revision },
        canonical: !preview && !this.patches.length && !this.draft,
      },
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
