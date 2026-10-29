import { evaluateReplay, type Composition, type ReplaySpec } from "@musart/core";
import type { CanvasSource } from "mediabunny";
import type { VideoCodec } from "mediabunny";
import type { FontResolver, MediaSourceResolver } from "@musart/render";
import { createReplayTiming, replayFrame } from "./replay-timing";

export interface VideoExportOptions {
  fontResolver?: FontResolver;
  mediaResolver?: MediaSourceResolver;
  duration: number;
  fps: number;
  scale: number;
  container: "auto" | "mp4" | "webm";
  pageId?: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  forceWebGL?: boolean;
}
export class VideoExportError extends Error {
  constructor(
    public readonly code:
      | "invalidOptions"
      | "missingPage"
      | "noCodec"
      | "emptyVideo"
      | "emptyHistory",
  ) {
    super(code);
    this.name = "VideoExportError";
  }
}
function abort(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

/** GPU canvas → browser VideoFrame → WebCodecs via Mediabunny; no JavaScript pixel buffers. */
export async function exportReplayVideo(
  spec: ReplaySpec,
  options: VideoExportOptions,
): Promise<Blob> {
  const { duration, fps, scale, container, signal } = options;
  if (
    !Number.isFinite(scale) ||
    scale < 0.1 ||
    scale > 4 ||
    !["auto", "mp4", "webm"].includes(container)
  )
    throw new VideoExportError("invalidOptions");
  let timing;
  try {
    timing = createReplayTiming(duration, fps, spec.duration);
  } catch {
    throw new VideoExportError("invalidOptions");
  }
  if (!spec.events.length) throw new VideoExportError("emptyHistory");
  abort(signal);
  const [
    { createRenderSession },
    {
      BufferTarget,
      canEncodeVideo,
      CanvasSource,
      Mp4OutputFormat,
      Output,
      Quality,
      WebMOutputFormat,
    },
  ] = await Promise.all([import("@musart/render"), import("mediabunny")]);
  abort(signal);
  const final = evaluateReplay(spec, spec.duration);
  const pageId = options.pageId ?? spec.pageId;
  const lastPage = final.pages.find((page) => page.id === pageId);
  if (!lastPage) throw new VideoExportError("missingPage");
  const width = Math.max(1, Math.round(lastPage.width * scale));
  const height = Math.max(1, Math.round(lastPage.height * scale));
  const quality = new Quality("high");
  const codecs: VideoCodec[] =
    container === "mp4" ? ["avc"] : container === "webm" ? ["vp9", "vp8"] : ["avc", "vp9", "vp8"];
  let codec: VideoCodec | undefined;
  for (const candidate of codecs) {
    abort(signal);
    if (await canEncodeVideo(candidate, { width, height, frameRate: fps, quality })) {
      codec = candidate;
      break;
    }
  }
  if (!codec) throw new VideoExportError("noCodec");
  const target = new BufferTarget();
  const output = new Output({
    format: codec === "avc" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const session = createRenderSession({
    forceWebGL: options.forceWebGL,
    ...(options.mediaResolver ? { mediaResolver: options.mediaResolver } : {}),
    ...(options.fontResolver ? { fontResolver: options.fontResolver } : {}),
  });
  let source: CanvasSource | undefined;
  let finalized = false;
  let closed = false;
  let cancellation: Promise<void> | undefined;
  const cancelOutput = () => (cancellation ??= Promise.resolve(output.cancel()));
  const onAbort = () => {
    void cancelOutput().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const { count } = timing;
    for (let index = 0; index < count; index++) {
      abort(signal);
      const sample = replayFrame(timing, index);
      const project = evaluateReplay(spec, sample.historyTime);
      const page: Composition = project.pages.find((item) => item.id === pageId) ?? {
        ...lastPage,
        layers: [],
      };
      // A recorded resize is contained in a constant-size video frame.
      const frame = { ...page, width: lastPage.width, height: lastPage.height };
      await session.withCanvasFrame(
        frame,
        { ...spec.assets, ...project.assets },
        async (canvas) => {
          abort(signal);
          if (!source) {
            source = new CanvasSource(canvas, {
              codec,
              quality,
              alpha: "discard",
              keyFrameInterval: 2,
            });
            // frameRate metadata would snap the shortened final sample beyond duration.
            output.addVideoTrack(source);
            await output.start();
          }
          await source.add(sample.timestamp, sample.duration, {
            keyFrame: index % (fps * 2) === 0,
          });
        },
        { scale },
      );
      options.onProgress?.((index + 1) / count);
    }
    abort(signal);
    source?.close();
    closed = true;
    await output.finalize();
    finalized = true;
    abort(signal);
    if (!target.buffer?.byteLength) throw new VideoExportError("emptyVideo");
    return new Blob([target.buffer], { type: codec === "avc" ? "video/mp4" : "video/webm" });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      if (!finalized) await cancelOutput();
    } finally {
      try {
        if (!closed) source?.close();
      } finally {
        await session.dispose();
      }
    }
  }
}
