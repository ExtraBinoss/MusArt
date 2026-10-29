import { videoTrackTime } from "./time";
import { acknowledgeVideoSink } from "./acknowledged-sink";
import { normalizeMotionTime, type MotionTime } from "@musart/core";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from "mediabunny";
import { VideoSourceError } from "./errors";
import type { DecodedVideoFrame, VideoDecodeBackend, VideoSourceMetadata } from "./model";

export function videoMicroseconds(seconds: number): MotionTime {
  const value = Math.round(seconds * 1_000_000);
  if (!Number.isSafeInteger(value))
    throw new VideoSourceError(
      "unsupported",
      "Video timestamp exceeds the supported native timebase.",
    );
  return normalizeMotionTime({ value, rate: 1_000_000 });
}

function convert(sample: VideoSample | null, timeResolution: number): DecodedVideoFrame | null {
  if (!sample) return null;
  try {
    if (!Number.isFinite(sample.duration) || sample.duration <= 0)
      throw new VideoSourceError(
        "unsupported",
        "Video sample has no positive presentation duration.",
      );
    const timestamp = videoTrackTime(sample.timestamp, timeResolution);
    const duration = videoTrackTime(sample.duration, timeResolution);
    if (duration.value <= 0)
      throw new VideoSourceError(
        "unsupported",
        "Video sample duration is below the track timebase.",
      );
    return {
      timestamp,
      duration,
      frame: sample.toVideoFrame(),
      width: sample.displayWidth,
      height: sample.displayHeight,
      rotation: sample.rotation,
      flip: sample.flip,
      pixelAspectRatio: {
        numerator: sample.pixelAspectRatio.num,
        denominator: sample.pixelAspectRatio.den,
      },
    };
  } finally {
    sample.close();
  }
}

/** Mediabunny owns demux/native decoding; no canvas copy or JavaScript pixel buffer is created. */
export function createMediabunnyVideoBackend(
  original: Blob,
  sourceCacheBytes: number,
): VideoDecodeBackend {
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: sourceCacheBytes }),
    formats: ALL_FORMATS,
  });
  let closed = false;
  let disposal: Promise<void> | null = null;
  interface Iteration {
    readonly iterator: AsyncGenerator<VideoSample | null>;
    readonly timeResolution: number;
    draining: Promise<void> | null;
    stream?: boolean;
  }
  const iterations = new Set<Iteration>();
  let acknowledgement: ReturnType<typeof acknowledgeVideoSink> | null = null;
  const ready = input.getPrimaryVideoTrack().then(async (track) => {
    if (!track || !(await track.canDecode()))
      throw new VideoSourceError("unsupported", "No decodable video track was found.");
    if (await track.canBeTransparent())
      throw new VideoSourceError(
        "alphaUnsupported",
        "Transparent video requires a verified GPU alpha-decoding adapter.",
      );
    if (await track.hasHighDynamicRange())
      throw new VideoSourceError(
        "unsupported",
        "HDR video requires a verified color-conversion adapter.",
      );
    const timeResolution = await track.getTimeResolution();
    videoTrackTime(0, timeResolution);
    return {
      track,
      timeResolution,
      sink: new VideoSampleSink(track, { optimizeForLatency: true }),
    };
  });
  // Opening can be canceled before any caller observes metadata/read; never leave an unhandled rejection.
  void ready.catch(() => {});
  const open = async (seconds: readonly number[]): Promise<Iteration> => {
    const { sink, timeResolution } = await ready;
    if (closed) throw new VideoSourceError("closed", "Video decoder is closed.");
    const iteration: Iteration = {
      iterator: sink.samplesAtTimestamps(seconds),
      timeResolution,
      draining: null,
    };
    iterations.add(iteration);
    return iteration;
  };
  const drain = (iteration: Iteration): Promise<void> => {
    if (!iteration.draining)
      iteration.draining = (async () => {
        try {
          if (iteration.stream) return;
          // return() alone does not await Mediabunny's decoder pump/finally. Batches are at most
          // four samples, so draining to done is bounded and waits for the native flush boundary.
          for (
            let result = await iteration.iterator.next();
            !result.done;
            result = await iteration.iterator.next()
          )
            result.value?.close();
        } finally {
          await iteration.iterator.return(undefined);
          iterations.delete(iteration);
        }
      })();
    return iteration.draining;
  };
  return {
    async metadata(): Promise<VideoSourceMetadata> {
      const { track, timeResolution } = await ready;
      const [codec, width, height, codedWidth, codedHeight, first, end] = await Promise.all([
        track.getCodec(),
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        track.getCodedWidth(),
        track.getCodedHeight(),
        track.getFirstTimestamp(),
        track.computeDuration(),
      ]);
      return {
        codec: codec ?? "unknown",
        width,
        height,
        codedWidth,
        codedHeight,
        firstTimestamp: videoTrackTime(first, timeResolution),
        endTimestamp: videoTrackTime(end, timeResolution),
        timeResolution,
      };
    },
    async read(seconds) {
      const iteration = await open([seconds]);
      let result: DecodedVideoFrame | null = null;
      try {
        for (
          let next = await iteration.iterator.next();
          !next.done;
          next = await iteration.iterator.next()
        ) {
          const sample = next.value;
          if (closed) {
            sample?.close();
            continue;
          }
          if (result) {
            sample?.close();
            throw new VideoSourceError("decodeFailed", "Video decoder returned extra samples.");
          }
          result = convert(sample, iteration.timeResolution);
        }
        if (closed) throw new VideoSourceError("closed", "Video decoder is closed.");
        return result;
      } catch (error) {
        result?.frame.close();
        throw error;
      } finally {
        await drain(iteration);
      }
    },
    async *batch(seconds) {
      if (seconds.length > 4)
        throw new VideoSourceError(
          "budgetExceeded",
          "Video timestamp batches are bounded to four requests.",
        );
      const iteration = await open(seconds);
      try {
        for (
          let next = await iteration.iterator.next();
          !next.done;
          next = await iteration.iterator.next()
        ) {
          const sample = next.value;
          if (closed) {
            sample?.close();
            throw new VideoSourceError("closed", "Video decoder is closed.");
          }
          yield convert(sample, iteration.timeResolution);
        }
      } finally {
        await drain(iteration);
      }
    },
    async *stream(startSeconds) {
      const { sink, timeResolution } = await ready;
      if (closed) throw new VideoSourceError("closed", "Video decoder is closed.");
      acknowledgement ??= acknowledgeVideoSink(sink);
      const iteration: Iteration = {
        iterator: sink.samples(startSeconds),
        timeResolution,
        draining: null,
        stream: true,
      };
      iterations.add(iteration);
      try {
        for (
          let next = await iteration.iterator.next();
          !next.done;
          next = await iteration.iterator.next()
        ) {
          if (closed) {
            next.value?.close();
            break;
          }
          const frame = convert(next.value, timeResolution);
          if (frame) yield frame;
        }
      } finally {
        await drain(iteration);
      }
    },
    dispose() {
      if (disposal) return disposal;
      closed = true;
      disposal = (async () => {
        await ready.catch(() => {});
        try {
          await Promise.all(Array.from(iterations, drain));
        } finally {
          input.dispose();
          await acknowledgement?.close();
        }
      })();
      return disposal;
    },
  };
}
