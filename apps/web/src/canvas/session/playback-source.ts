import type { Asset, Composition, EnginePort } from "@musart/core";

export interface PlaybackFrame {
  page: Composition;
  assets: Record<string, Asset>;
  playback: true;
}
export interface PlaybackSource {
  read: () => PlaybackFrame | null;
  set: (frame: Omit<PlaybackFrame, "playback"> | null) => void;
  subscribe: (listener: () => void) => () => void;
}
const sources = new WeakMap<EnginePort, PlaybackSource>();

/** Isolated presentation state. Scrubbing never loads a project or writes document history. */
export function createPlaybackSource(engine: EnginePort): PlaybackSource {
  const existing = sources.get(engine);
  if (existing) return existing;
  let frame: PlaybackFrame | null = null;
  const listeners = new Set<() => void>();
  const source: PlaybackSource = {
    read: () => frame,
    set: (next) => {
      if (next === null && frame === null) return;
      frame = next ? { ...next, playback: true } : null;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  sources.set(engine, source);
  return source;
}
