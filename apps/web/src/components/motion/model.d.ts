import type { Composition, MotionFrameRate, MotionTime } from "@musart/core";

export interface TimelineTransportState {
  readonly compositionId: string;
  readonly mode: "static" | "motion";
  readonly time: MotionTime;
  readonly duration: MotionTime;
  readonly frameRate: MotionFrameRate;
  readonly playing: boolean;
  readonly playbackMode: "once" | "loop" | "pingPong";
}

/** Structural adapter: presentation never owns the playback clock or durable timeline. */
export interface TimelineTransport {
  read(): TimelineTransportState;
  subscribe(listener: () => void): () => void;
  seek(time: MotionTime): void;
  play(): void;
  pause(): void;
  setPlaybackMode(mode: TimelineTransportState["playbackMode"]): void;
  readFrame?(): Composition | null;
}

export type TimelineUnit = "s" | "ms";
