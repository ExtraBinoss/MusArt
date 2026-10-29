import {
  assetOriginalIdentity,
  compareMotionTime,
  isVideoAsset,
  motionTimeToSeconds,
  type Asset,
  type MotionProgram,
  type MotionTime,
} from "@musart/core";
import type { MediaSourceResolver } from "../../../sources/media/model";
import { MotionExportError } from "../errors";
import { motionAudioSampleCount } from "../timing";
import type { MotionAudioSource } from "./model";
import { openMotionAudioSource } from "./source";
import { sampleMotionPcm } from "./resample";

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
  program: MotionProgram,
  assets: Record<string, Asset>,
  resolver: MediaSourceResolver | undefined,
  options: {
    sampleRate?: number;
    channels?: 1 | 2;
    blockFrames?: number;
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
  const sources = new Map<string, MotionAudioSource | null>();
  const lanes: {
    source: MotionAudioSource;
    first: number;
    after: number;
    offset: number;
    volume: number;
  }[] = [];
  let closed = false,
    reading = false;
  async function dispose() {
    if (closed) return;
    closed = true;
    const results = await Promise.allSettled(
      [...sources.values()]
        .filter((source): source is MotionAudioSource => source !== null)
        .map((source) => source.dispose()),
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
    for (const layer of program.layers) {
      options.signal?.throwIfAborted();
      if (
        !layer.media ||
        layer.media.mute ||
        layer.media.volume === 0 ||
        !layer.end ||
        compareMotionTime(layer.start, layer.end) >= 0
      )
        continue;
      if (!resolver)
        throw new MotionExportError(
          "missingOriginal",
          "Motion source audio requires an original-media resolver.",
        );
      const asset = assets[layer.media.assetId];
      if (!asset || !isVideoAsset(asset))
        throw new MotionExportError("missingOriginal", "Motion audio layer has no video original.");
      const identity = assetOriginalIdentity(asset);
      if (!sources.has(identity)) {
        if (sources.size >= 4)
          throw new MotionExportError(
            "unsupportedAudio",
            "Motion audio exceeds its four-original decoder budget.",
          );
        sources.set(identity, await openMotionAudioSource(asset, resolver, options));
      }
      const source = sources.get(identity);
      if (source)
        lanes.push({
          source,
          first: Math.max(0, ceilSample(layer.start, sampleRate)),
          after: Math.min(samples, ceilSample(layer.end, sampleRate)),
          offset:
            motionTimeToSeconds(layer.media.sourceStart) -
            motionTimeToSeconds(layer.media.timelineStart),
          volume: layer.media.volume,
        });
    }
    if (lanes.length && samples < 1)
      throw new MotionExportError(
        "invalidOptions",
        "Motion duration is shorter than one output audio sample.",
      );
    return {
      sampleRate,
      channels,
      blockFrames,
      samples,
      hasAudio: lanes.length > 0,
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
          for (const lane of lanes) {
            const first = Math.max(start, lane.first),
              after = Math.min(start + count, lane.after);
            if (first >= after) continue;
            const chunks = await lane.source.readWindow(
              lane.offset + first / sampleRate,
              lane.offset + after / sampleRate,
              options,
            );
            options.signal?.throwIfAborted();
            if (closed) throw new MotionExportError("closed", "Audio mixer closed during a block.");
            for (let frame = first; frame < after; frame++)
              for (let channel = 0; channel < channels; channel++)
                mixed[channel * count + frame - start]! +=
                  sampleMotionPcm(chunks, lane.offset + frame / sampleRate, channel, channels) *
                  lane.volume;
          }
          return Float32Array.from(mixed, (value) => Math.max(-1, Math.min(1, value)));
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
