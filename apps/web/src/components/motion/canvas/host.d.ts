import type { RefObject } from "react";
import type { TimelineCanvasHit, TimelineCanvasModel, TimelineCanvasSurface } from "./model";

export interface TimelineCanvasAudioDraft {
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly sourceIn: number;
}

/** One imperative body and one transient DOM target share the same painted projection. */
export interface TimelineCanvasHost {
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly root: RefObject<HTMLDivElement | null>;
  readHit(this: void, clientX: number, clientY: number): TimelineCanvasHit | null;
  readModel(this: void): TimelineCanvasModel;
  readSurface(this: void): TimelineCanvasSurface | null;
  invalidate(this: void): void;
  readSelectedAudio(this: void): string | null;
  selectAudio(this: void, id: string | null): void;
  subscribeAudioSelection(this: void, listener: () => void): () => void;
  setAudioDraft(this: void, draft: TimelineCanvasAudioDraft | null): void;
  setHoverHit(this: void, hit: TimelineCanvasHit | null): void;
}
