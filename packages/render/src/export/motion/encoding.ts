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
  audio: { sampleRate: number; channels: number } | null;
  signal?: AbortSignal;
}) {
  options.signal?.throwIfAborted();
  assertMotionAlphaMode(options.alpha);
  if (!["auto", "mp4", "webm"].includes(options.container))
    throw new MotionExportError("invalidOptions", "Invalid Motion output container.");
  const quality = new Quality("high");
  const candidates: { container: "mp4" | "webm"; video: VideoCodec; audio: AudioCodec }[] = [
    { container: "mp4", video: "avc", audio: "aac" },
    { container: "webm", video: "vp9", audio: "opus" },
    { container: "webm", video: "vp8", audio: "opus" },
  ];
  let supportedVideo = false;
  for (const candidate of candidates) {
    if (options.container !== "auto" && candidate.container !== options.container) continue;
    options.signal?.throwIfAborted();
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
        quality,
      }))
    )
      continue;
    options.signal?.throwIfAborted();
    return {
      videoCodec: candidate.video,
      audioCodec: candidate.audio,
      quality,
      format:
        candidate.container === "mp4"
          ? new Mp4OutputFormat({ fastStart: false })
          : new WebMOutputFormat(),
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
