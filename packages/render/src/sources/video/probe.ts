import { subtractMotionTime, type MotionTime, type VideoAsset } from "@musart/core";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { videoTrackTime } from "./time";
import { VideoSourceError } from "./errors";
export interface VideoOriginalProbe {
  readonly width: number;
  readonly height: number;
  readonly duration: MotionTime;
  readonly firstTimestamp: MotionTime;
  readonly timeResolution: number;
  readonly orientation: VideoAsset["orientation"];
  readonly audio: {
    readonly codec: string;
    readonly sampleRate: number;
    readonly channels: number;
  } | null;
}
/** Metadata is read from the video track, never the container/audio tail. No pixels are decoded. */
export async function probeVideoOriginal(
  original: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<VideoOriginalProbe> {
  options.signal?.throwIfAborted();
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  const abort = () => input.dispose();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new VideoSourceError(
        "unsupported",
        "No supported video decoder was found for this file.",
      );
    if (await track.canBeTransparent())
      throw new VideoSourceError(
        "alphaUnsupported",
        "Transparent video requires a verified GPU alpha-decoding adapter.",
      );
    if (await track.hasHighDynamicRange())
      throw new VideoSourceError(
        "unsupported",
        "HDR video needs a verified color conversion adapter.",
      );
    const [width, height, first, end, timeResolution, rotation, flip, aspect, audioTrack] =
      await Promise.all([
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        track.getFirstTimestamp(),
        track.computeDuration(),
        track.getTimeResolution(),
        track.getRotation(),
        track.getFlip(),
        track.getPixelAspectRatio(),
        input.getPrimaryAudioTrack(),
      ]);
    let audio: VideoOriginalProbe["audio"] = null;
    if (audioTrack) {
      if (!(await audioTrack.canDecode()))
        throw new VideoSourceError(
          "unsupported",
          "This file's embedded audio cannot be decoded; it will not be silently discarded.",
        );
      audio = {
        codec: (await audioTrack.getCodec()) ?? "unknown",
        sampleRate: await audioTrack.getSampleRate(),
        channels: await audioTrack.getNumberOfChannels(),
      };
    }
    options.signal?.throwIfAborted();
    const firstTimestamp = videoTrackTime(first, timeResolution),
      duration = subtractMotionTime(videoTrackTime(end, timeResolution), firstTimestamp);
    if (
      duration.value <= 0 ||
      ![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 32768)
    )
      throw new VideoSourceError("unsupported", "Video has no usable display range or dimensions.");
    return Object.freeze({
      width,
      height,
      duration,
      firstTimestamp,
      timeResolution,
      orientation: Object.freeze({
        rotation,
        flip,
        pixelAspectRatio: Object.freeze({ numerator: aspect.num, denominator: aspect.den }),
      }),
      audio: audio && Object.freeze(audio),
    });
  } finally {
    options.signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}
