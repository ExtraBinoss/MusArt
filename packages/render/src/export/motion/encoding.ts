import {
  canEncodeAudio,
  canEncodeVideo,
  Mp4OutputFormat,
  Quality,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import { MotionExportError } from "./errors";

/** Alpha splitting currently performs pixel copies in Mediabunny; fail before any setup. */
export function assertMotionAlphaMode(alpha: "discard" | "keep"): void {
  if (alpha === "keep")
    throw new MotionExportError(
      "alphaUnsupported",
      "Transparent Motion export requires a verified GPU alpha-encoding adapter.",
    );
  if (alpha !== "discard")
    throw new MotionExportError("invalidOptions", "Invalid Motion alpha mode.");
}

export async function chooseMotionEncoding(options: {
  container: "auto" | "mp4" | "webm";
  alpha: "discard" | "keep";
  width: number;
  height: number;
  frameRate: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audio: { sampleRate: number; channels: number } | null;
  signal?: AbortSignal;
}) {
  options.signal?.throwIfAborted();
  assertMotionAlphaMode(options.alpha);
  if (!["auto", "mp4", "webm"].includes(options.container))
    throw new MotionExportError("invalidOptions", "Invalid Motion output container.");
  const videoBitrate = options.videoBitrate ?? 8_000_000;
  const audioBitrate = options.audioBitrate ?? 192_000;
  if (
    !Number.isInteger(videoBitrate) ||
    videoBitrate < 64_000 ||
    videoBitrate > 100_000_000 ||
    !Number.isInteger(audioBitrate) ||
    audioBitrate < 32_000 ||
    audioBitrate > 512_000
  )
    throw new MotionExportError(
      "invalidOptions",
      "Video/audio bitrates exceed the supported output range.",
    );
  const quality = new Quality({ bitrate: videoBitrate, bitrateMode: "variable" });
  const audioQuality = new Quality({ bitrate: audioBitrate });
  const candidates: { container: "mp4" | "webm"; video: VideoCodec; audio: AudioCodec }[] = [
    { container: "mp4", video: "avc", audio: "aac" },
    { container: "webm", video: "vp9", audio: "opus" },
    { container: "webm", video: "vp8", audio: "opus" },
  ];
  let supportedVideo = false;
  for (const candidate of candidates) {
    if (options.container !== "auto" && candidate.container !== options.container) continue;
    options.signal?.throwIfAborted();
    const format =
      candidate.container === "mp4"
        ? new Mp4OutputFormat({ fastStart: false })
        : new WebMOutputFormat();
    if (
      !format.getSupportedVideoCodecs().includes(candidate.video) ||
      (options.audio && !format.getSupportedAudioCodecs().includes(candidate.audio))
    )
      continue;
    if (
      !(await canEncodeVideo(candidate.video, {
        width: options.width,
        height: options.height,
        frameRate: options.frameRate,
        quality,
      }))
    )
      continue;
    supportedVideo = true;
    if (
      options.audio &&
      !(await canEncodeAudio(candidate.audio, {
        numberOfChannels: options.audio.channels,
        sampleRate: options.audio.sampleRate,
        quality: audioQuality,
      }))
    )
      continue;
    options.signal?.throwIfAborted();
    return {
      videoCodec: candidate.video,
      audioCodec: candidate.audio,
      quality,
      audioQuality,
      format,
      mimeType: candidate.container === "mp4" ? ("video/mp4" as const) : ("video/webm" as const),
    };
  }
  throw new MotionExportError(
    supportedVideo && options.audio ? "noAudioCodec" : "noVideoCodec",
    supportedVideo && options.audio
      ? "No supported audio encoder is available for the requested Motion output."
      : "No supported video encoder is available at this size and frame rate.",
  );
}
