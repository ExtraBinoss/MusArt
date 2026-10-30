import {
  assetOriginalIdentity,
  compareMotionTime,
  isOriginalMediaAsset,
  type OriginalMediaAsset,
  motionTimeToSeconds,
  type Asset,
  type MotionTime,
  type MotionAudioProcessing,
} from "@musart/core";
import type { MediaSourceResolver } from "../../../sources/media/model";
import { MotionExportError } from "../errors";
import { motionAudioSampleCount } from "../timing";
import type { MotionAudioPlan, MotionAudioSource } from "./model";
import { openMotionAudioSource } from "./source";
import { createMotionAudioWindows } from "./windows";
import { sampleMotionPcm } from "./resample";
import { createMotionAudioDsp, motionAudioDspSettings, motionAudioEnvelope } from "./dsp";

const MAX_DSP_BYTES = 32 * 1024 * 1024;
interface AudioLane {
  id?: string;
  identity: string;
  asset: OriginalMediaAsset;
  first: number;
  after: number;
  fadeFirst: number;
  fadeAfter: number;
  offset: number;
  volume: number;
  mute: boolean;
  processing?: MotionAudioProcessing;
  settings: ReturnType<typeof motionAudioDspSettings>;
}

function ceilSample(time: MotionTime, rate: number) {
  const numerator = BigInt(time.value) * BigInt(rate),
    denominator = BigInt(time.rate);
  const value =
    numerator >= 0n ? (numerator + denominator - 1n) / denominator : numerator / denominator;
  if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new MotionExportError("invalidOptions", "Audio interval exceeds its sample timebase.");
  return Number(value);
}

/** Offline audio follows compiled ancestor intervals and source PTS, independently of visual opacity. */
export async function createMotionAudioMixer(
  program: MotionAudioPlan,
  assets: Record<string, Asset>,
  resolver: MediaSourceResolver | undefined,
  options: {
    sampleRate?: number;
    channels?: 1 | 2;
    blockFrames?: number;
    /** Audition can apply a native GainNode after the shared floating-point DSP. */
    clampOutput?: boolean;
    /** Live playback admits sources at their first intersecting block. Export validates eagerly. */
    lazySources?: boolean;
    sourceReadAhead?: number;
    signal?: AbortSignal;
  } = {},
) {
  if (program.mode !== "motion" || !program.duration)
    throw new MotionExportError(
      "missingMotion",
      "Source audio mixing requires an authored Motion program.",
    );
  const sampleRate = options.sampleRate ?? 48000,
    channels = options.channels ?? 2,
    blockFrames = options.blockFrames ?? 4096;
  const samples = motionAudioSampleCount(program.duration, sampleRate);
  if (
    (channels !== 1 && channels !== 2) ||
    !Number.isInteger(blockFrames) ||
    blockFrames < 1 ||
    blockFrames > Math.min(8192, sampleRate)
  )
    throw new MotionExportError(
      "invalidOptions",
      "Audio needs mono/stereo output and a bounded PCM block size.",
    );
  const sources = new Map<string, MotionAudioSource>();
  const windows = createMotionAudioWindows(options.sourceReadAhead ?? 0);
  const lanes: AudioLane[] = [];
  const volumePreview = new Map<string, number>();
  const mixState = new Map<string, { volume: number; mute: boolean }>();
  const audioIds = new Set(program.audio.map((track) => track.id));
  const processors = new Map<
    AudioLane,
    { dsp: ReturnType<typeof createMotionAudioDsp>; next: number }
  >();
  let dspBytes = 0;
  const volumeFor = (lane: AudioLane) => {
    const base = (lane.id ? mixState.get(lane.id) : undefined) ?? lane;
    if (base.mute) return 0;
    return lane.id ? (volumePreview.get(lane.id) ?? base.volume) : base.volume;
  };
  const releaseProcessor = (lane: AudioLane) => {
    const state = processors.get(lane);
    if (!state) return;
    state.dsp.dispose();
    dspBytes -= state.dsp.byteLength;
    processors.delete(lane);
  };
  const processorFor = (lane: AudioLane) => {
    if (lane.settings.mix === 0) return undefined;
    let state = processors.get(lane);
    if (!state) {
      try {
        const dsp = createMotionAudioDsp(
          lane.processing,
          sampleRate,
          channels,
          MAX_DSP_BYTES - dspBytes,
        );
        state = { dsp, next: -1 };
        dspBytes += dsp.byteLength;
        processors.set(lane, state);
      } catch (cause) {
        throw new MotionExportError(
          "unsupportedAudio",
          `Audio reverb state budget exceeded for clip ${lane.id ?? lane.asset.id}.`,
          { cause },
        );
      }
    }
    return state;
  };
  const knownSilent = new Set<string>();
  async function sourceFor(identity: string, asset: OriginalMediaAsset) {
    if (!resolver)
      throw new MotionExportError(
        "missingOriginal",
        "Motion source audio requires an original-media resolver.",
      );
    if (knownSilent.has(identity)) return null;
    const cached = sources.get(identity);
    if (cached) {
      sources.delete(identity);
      sources.set(identity, cached);
      return cached;
    }
    if (sources.size >= 4) {
      const oldest = sources.keys().next().value!;
      const removed = sources.get(oldest);
      sources.delete(oldest);
      if (removed) windows.forget(removed);
      await removed?.dispose();
    }
    const source = await openMotionAudioSource(asset, resolver, options);
    try {
      options.signal?.throwIfAborted();
      if (closed)
        throw new MotionExportError("closed", "Audio mixer closed while opening a source.");
    } catch (error) {
      try {
        await source?.dispose();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], "Audio source admission and cleanup failed.");
      }
      throw error;
    }
    if (source) sources.set(identity, source);
    else knownSilent.add(identity);
    return source;
  }
  let closed = false,
    reading = false;
  async function dispose() {
    if (closed) return;
    closed = true;
    windows.dispose();
    for (const lane of processors.keys()) releaseProcessor(lane);
    volumePreview.clear();
    mixState.clear();
    audioIds.clear();
    const results = await Promise.allSettled(
      [...sources.values()].map((source) => source.dispose()),
    );
    sources.clear();
    lanes.length = 0;
    const errors = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (errors.length)
      throw new AggregateError(
        errors.map((result) => result.reason),
        "Audio mixer cleanup failed.",
      );
  }
  try {
    for (const { layer, id } of [
      ...program.layers.map((layer) => ({ layer, id: undefined })),
      ...program.audio.map((layer) => ({ layer, id: layer.id })),
    ]) {
      options.signal?.throwIfAborted();
      if (
        !layer.media ||
        (layer.media.mute && id === undefined) ||
        (layer.media.volume === 0 && id === undefined) ||
        !layer.end ||
        compareMotionTime(layer.start, layer.end) >= 0
      )
        continue;
      const audible = !layer.media.mute && layer.media.volume > 0;
      if (!resolver && audible)
        throw new MotionExportError(
          "missingOriginal",
          "Motion source audio requires an original-media resolver.",
        );
      const asset = assets[layer.media.assetId];
      if (!asset || !isOriginalMediaAsset(asset))
        throw new MotionExportError(
          "missingOriginal",
          "Motion audio lane has no immutable media original.",
        );
      const identity = assetOriginalIdentity(asset);
      const deferred = audible && options.lazySources;
      const source = audible && !deferred ? await sourceFor(identity, asset) : null;
      if (source || deferred || (id !== undefined && !audible))
        lanes.push({
          id,
          identity,
          asset,
          first: Math.max(0, ceilSample(layer.start, sampleRate)),
          after: Math.min(samples, ceilSample(layer.end, sampleRate)),
          fadeFirst: motionTimeToSeconds(layer.media.timelineStart) * sampleRate,
          fadeAfter: motionTimeToSeconds(layer.media.timelineEnd ?? layer.end) * sampleRate,
          offset:
            motionTimeToSeconds(layer.media.sourceStart) -
            motionTimeToSeconds(layer.media.timelineStart),
          volume: layer.media.volume,
          mute: layer.media.mute,
          processing: layer.media.processing,
          settings: motionAudioDspSettings(layer.media.processing, sampleRate, channels),
        });
    }
    if (lanes.some((lane) => volumeFor(lane) > 0) && samples < 1)
      throw new MotionExportError(
        "invalidOptions",
        "Motion duration is shorter than one output audio sample.",
      );
    return {
      sampleRate,
      channels,
      blockFrames,
      samples,
      get hasAudio() {
        return (
          !closed && lanes.some((lane) => volumeFor(lane) > 0 && !knownSilent.has(lane.identity))
        );
      },
      setVolumePreview(trackId: string, volume: number | null) {
        if (closed) throw new MotionExportError("closed", "Audio mixer is closed.");
        if (!audioIds.has(trackId)) return;
        if (volume !== null && (!Number.isFinite(volume) || volume < 0 || volume > 2))
          throw new MotionExportError(
            "invalidOptions",
            "Audio volume preview must be between zero and two.",
          );
        if (volume === null) volumePreview.delete(trackId);
        else volumePreview.set(trackId, volume);
      },
      /** Live volume/mute commits rebase the mixer without replacing its clock or decoder. */
      setMixState(trackId: string, state: { volume: number; mute: boolean }) {
        if (closed) throw new MotionExportError("closed", "Audio mixer is closed.");
        if (!audioIds.has(trackId)) return;
        if (
          !Number.isFinite(state.volume) ||
          state.volume < 0 ||
          state.volume > 2 ||
          typeof state.mute !== "boolean"
        )
          throw new MotionExportError(
            "invalidOptions",
            "Audio mix state needs a finite gain and mute flag.",
          );
        mixState.set(trackId, { volume: state.volume, mute: state.mute });
        volumePreview.delete(trackId);
      },
      async readBlock(start: number, count: number) {
        options.signal?.throwIfAborted();
        if (closed) throw new MotionExportError("closed", "Audio mixer is closed.");
        if (reading)
          throw new MotionExportError("busy", "Audio mix blocks must be consumed serially.");
        if (
          !Number.isSafeInteger(start) ||
          start < 0 ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > blockFrames ||
          start + count > samples
        )
          throw new MotionExportError("invalidOptions", "PCM block is outside the Motion export.");
        reading = true;
        try {
          const mixed = new Float64Array(count * channels);
          // Snapshot once: asynchronous UI updates take effect at the next block boundary.
          const levels = new Map(lanes.map((lane) => [lane, volumeFor(lane)]));
          for (const lane of processors.keys())
            if (lane.first >= start + count || lane.after <= start || levels.get(lane) === 0)
              releaseProcessor(lane);
          for (const lane of lanes) {
            const first = Math.max(start, lane.first),
              after = Math.min(start + count, lane.after);
            const volume = levels.get(lane)!;
            if (first >= after || volume === 0) continue;
            const source = await sourceFor(lane.identity, lane.asset);
            if (!source && lane.asset.kind === "audio")
              throw new MotionExportError(
                "unsupportedAudio",
                "An audio source disappeared during mixing.",
              );
            if (!source) continue;
            const state = processorFor(lane);
            let cursor = first;
            if (state && state.next !== first) {
              state.dsp.reset();
              cursor = Math.max(lane.first, first - state.dsp.historyFrames);
            }
            try {
              // Seek reconstructs only the finite FIR horizon, in bounded decoder windows.
              while (cursor < after) {
                const end = Math.min(after, cursor + blockFrames);
                const chunks = await windows.read(
                  source,
                  lane.offset + cursor / sampleRate,
                  lane.offset + end / sampleRate,
                  options,
                );
                options.signal?.throwIfAborted();
                if (closed)
                  throw new MotionExportError("closed", "Audio mixer closed during a block.");
                for (let frame = cursor; frame < end; frame++) {
                  const envelope = motionAudioEnvelope(
                    frame,
                    lane.fadeFirst,
                    lane.fadeAfter,
                    lane.settings.fadeIn,
                    lane.settings.fadeOut,
                  );
                  for (let channel = 0; channel < channels; channel++) {
                    const dry = sampleMotionPcm(
                      chunks,
                      lane.offset + frame / sampleRate,
                      channel,
                      channels,
                    );
                    const wetDry = state ? state.dsp.sample(dry, channel) : dry;
                    if (frame >= first)
                      mixed[channel * count + frame - start]! += wetDry * envelope * volume;
                  }
                }
                cursor = end;
                if (state) state.next = end;
              }
            } catch (error) {
              releaseProcessor(lane);
              throw error;
            }
          }
          return options.clampOutput === false
            ? Float32Array.from(mixed)
            : Float32Array.from(mixed, (value) => Math.max(-1, Math.min(1, value)));
        } finally {
          reading = false;
        }
      },
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Motion audio initialization and cleanup failed.");
    }
    throw error;
  }
}
