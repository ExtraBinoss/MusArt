import {
  assetOriginalIdentity,
  isAudioAsset,
  motionTimeToSeconds,
  type AudioAsset,
  type EnginePort,
} from "@musart/core";
import type { TimelineCanvasModel } from "./model";

interface Wanted {
  readonly asset: AudioAsset;
  readonly identity: string;
}

/** One shared-worker request at a time; only visible clips retain envelope references. */
export function createTimelineCanvasWaveforms({
  engine,
  prepare,
  readModel,
  publish,
  onError,
}: {
  engine: EnginePort;
  prepare(this: void, asset: AudioAsset): Promise<Float32Array>;
  readModel(this: void): TimelineCanvasModel;
  publish(this: void, peaks: ReadonlyMap<string, readonly number[]>): void;
  onError(this: void, error: unknown): void;
}) {
  let wanted = new Map<string, Wanted>(),
    published = new Map<string, readonly number[]>(),
    active = false,
    paused = false,
    resumeEpoch = 0,
    closed = false;
  const ready = new Map<string, readonly number[]>(),
    failed = new Set<string>(),
    interrupted = new Set<string>();
  function emit() {
    const next = new Map<string, readonly number[]>();
    for (const [id, entry] of wanted) {
      const peaks = ready.get(entry.identity);
      if (peaks) next.set(id, peaks);
    }
    if (
      next.size === published.size &&
      [...next].every(([id, peaks]) => published.get(id) === peaks)
    )
      return;
    published = next;
    publish(next);
  }
  function pump() {
    if (closed || active || paused) return;
    const entry = [...wanted.values()].find(
      (entry) =>
        !ready.has(entry.identity) &&
        !failed.has(entry.identity) &&
        !interrupted.has(entry.identity),
    );
    if (!entry) return;
    active = true;
    const origin = engine.getSnapshot(),
      epoch = resumeEpoch;
    void prepare(entry.asset)
      .then(
        (peaks) => {
          const current = engine.getSnapshot();
          if (closed || current.project !== origin.project || current.pageId !== origin.pageId)
            return;
          if ([...wanted.values()].some((value) => value.identity === entry.identity)) {
            ready.set(entry.identity, Array.from(peaks));
            emit();
          }
        },
        (error: unknown) => {
          const current = engine.getSnapshot();
          if (closed || current.project !== origin.project || current.pageId !== origin.pageId)
            return;
          if (error instanceof DOMException && error.name === "AbortError") {
            // A canceled request gets at most one retry per resume, never an asynchronous retry loop.
            if (paused || epoch === resumeEpoch) interrupted.add(entry.identity);
            return;
          }
          failed.add(entry.identity);
          if ([...wanted.values()].some((value) => value.identity === entry.identity))
            onError(error);
        },
      )
      .finally(() => {
        active = false;
        pump();
      });
  }
  return {
    setPaused(value: boolean) {
      if (closed || paused === value) return;
      paused = value;
      if (!value) {
        resumeEpoch++;
        interrupted.clear();
        pump();
      }
    },
    update(top: number, height: number, left: number, width: number) {
      if (closed) return;
      const model = readModel(),
        offset = model.rows.length,
        first = Math.max(0, Math.floor(top / model.rowHeight) - offset),
        after = Math.max(0, Math.ceil((top + height) / model.rowHeight) - offset),
        next = new Map<string, Wanted>();
      for (const track of model.audioTracks.slice(first, after)) {
        const start =
            model.audioDraft?.trackId === track.id
              ? model.audioDraft.start
              : motionTimeToSeconds(track.start),
          end = Math.min(
            model.duration,
            model.audioDraft?.trackId === track.id
              ? model.audioDraft.end
              : motionTimeToSeconds(track.end),
          ),
          asset = model.assets[track.assetId];
        if (
          end <= start ||
          start * model.scale >= left + width ||
          end * model.scale <= left ||
          !asset ||
          !isAudioAsset(asset)
        )
          continue;
        next.set(track.id, { asset, identity: assetOriginalIdentity(asset) });
      }
      wanted = next;
      const identities = new Set([...wanted.values()].map((entry) => entry.identity));
      for (const id of ready.keys()) if (!identities.has(id)) ready.delete(id);
      for (const id of failed) if (!identities.has(id)) failed.delete(id);
      for (const id of interrupted) if (!identities.has(id)) interrupted.delete(id);
      emit();
      pump();
    },
    dispose() {
      closed = true;
      wanted.clear();
      ready.clear();
      failed.clear();
      interrupted.clear();
      published.clear();
    },
  };
}
