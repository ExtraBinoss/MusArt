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

const MAX_ENTRIES = 64,
  MAX_BYTES = 1024 * 1024;

/** One request at a time; a bounded identity cache retains genuine peaks across viewport exits. */
export function createTimelineCanvasWaveforms({
  engine,
  prepare,
  cached,
  overscan = 0,
  readModel,
  publish,
  onError,
}: {
  engine: EnginePort;
  prepare(this: void, asset: AudioAsset): Promise<Float32Array>;
  cached?(this: void, asset: AudioAsset): Float32Array | undefined;
  overscan?: number;
  readModel(this: void): TimelineCanvasModel;
  publish(this: void, peaks: ReadonlyMap<string, readonly number[]>): void;
  onError(this: void, error: unknown): void;
}) {
  let wanted = new Map<string, Wanted>(),
    published = new Map<string, readonly number[]>(),
    active = false,
    paused = false,
    resumeEpoch = 0,
    closed = false,
    bytes = 0;
  const ready = new Map<string, readonly number[]>(),
    failed = new Set<string>(),
    interrupted = new Set<string>(),
    attempted = new Set<string>();
  function currentAsset(entry: Wanted) {
    const canonical = engine.getSnapshot().project.assets[entry.asset.id];
    const presented = readModel().assets[entry.asset.id];
    return (
      !!canonical &&
      isAudioAsset(canonical) &&
      assetOriginalIdentity(canonical) === entry.identity &&
      !!presented &&
      isAudioAsset(presented) &&
      assetOriginalIdentity(presented) === entry.identity
    );
  }
  function remember(identity: string, peaks: Float32Array) {
    const size = peaks.length * 8;
    if (!peaks.length || size > MAX_BYTES)
      throw Error("Audio waveform exceeds the timeline preview budget.");
    const values = Object.freeze(Array.from(peaks));
    const old = ready.get(identity);
    if (old) bytes -= old.length * 8;
    ready.delete(identity);
    ready.set(identity, values);
    bytes += size;
    while (ready.size > MAX_ENTRIES || bytes > MAX_BYTES) {
      const first = ready.keys().next().value!;
      bytes -= ready.get(first)!.length * 8;
      ready.delete(first);
    }
  }
  function emit() {
    const next = new Map<string, readonly number[]>();
    for (const [id, entry] of wanted) {
      const peaks = ready.get(entry.identity);
      if (peaks && currentAsset(entry)) {
        ready.delete(entry.identity);
        ready.set(entry.identity, peaks);
        next.set(id, peaks);
      }
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
    if (closed || active || paused || attempted.size >= MAX_ENTRIES) return;
    const entry = [...wanted.values()].find(
      (entry) =>
        !ready.has(entry.identity) &&
        !failed.has(entry.identity) &&
        !interrupted.has(entry.identity) &&
        !attempted.has(entry.identity) &&
        currentAsset(entry),
    );
    if (!entry) return;
    attempted.add(entry.identity);
    active = true;
    const origin = engine.getSnapshot(),
      epoch = resumeEpoch;
    void prepare(entry.asset)
      .then(
        (peaks) => {
          const current = engine.getSnapshot();
          if (
            closed ||
            current.project !== origin.project ||
            current.pageId !== origin.pageId ||
            !currentAsset(entry)
          ) {
            attempted.delete(entry.identity);
            return;
          }
          try {
            remember(entry.identity, peaks);
            emit();
          } catch (error) {
            failed.add(entry.identity);
            if ([...wanted.values()].some((value) => value.identity === entry.identity))
              onError(error);
          }
        },
        (error: unknown) => {
          const current = engine.getSnapshot();
          if (
            closed ||
            current.project !== origin.project ||
            current.pageId !== origin.pageId ||
            !currentAsset(entry)
          ) {
            attempted.delete(entry.identity);
            return;
          }
          if (error instanceof DOMException && error.name === "AbortError") {
            // A canceled request gets at most one retry per resume, never an asynchronous retry loop.
            attempted.delete(entry.identity);
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
        attempted.clear();
        pump();
      }
    },
    update(top: number, height: number, left: number, width: number) {
      if (closed) return;
      const model = readModel(),
        offset = model.rows.length,
        visibleFirst = Math.max(0, Math.floor(top / model.rowHeight) - offset),
        visibleAfter = Math.max(0, Math.ceil((top + height) / model.rowHeight) - offset),
        first = Math.max(0, Math.floor(top / model.rowHeight) - offset - overscan),
        after = Math.max(0, Math.ceil((top + height) / model.rowHeight) - offset + overscan),
        next = new Map<string, Wanted>();
      const admit = (track: (typeof model.audioTracks)[number]) => {
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
          return;
        next.set(track.id, { asset, identity: assetOriginalIdentity(asset) });
      };
      // Visible originals lead the serial queue; lookahead must not delay a cold viewport.
      for (const track of model.audioTracks.slice(visibleFirst, visibleAfter)) admit(track);
      for (const track of model.audioTracks.slice(first, Math.min(after, visibleFirst)))
        admit(track);
      for (const track of model.audioTracks.slice(Math.max(first, visibleAfter), after))
        admit(track);
      const changed =
        next.size !== wanted.size ||
        [...next].some(([id, entry]) => wanted.get(id)?.identity !== entry.identity);
      wanted = next;
      // Warm results are available even while new worker admission is held by scroll.
      if (cached)
        for (const entry of wanted.values()) {
          if (ready.has(entry.identity)) continue;
          const peaks = cached(entry.asset);
          if (peaks?.length) remember(entry.identity, peaks);
        }
      if (changed) attempted.clear();
      const identities = new Set([...wanted.values()].map((entry) => entry.identity));
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
      attempted.clear();
      published.clear();
      bytes = 0;
    },
  };
}
