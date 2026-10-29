import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ImageAsset, VideoAsset } from "../../packages/core/src/index";
import type {
  MotionTemplateMedia,
  MotionTemplateManifest,
} from "../../apps/web/src/services/projects/templates/motion/model";

const execute = promisify(execFile);
interface StockSource {
  id: string;
  file: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
}
interface StockManifest {
  media: StockSource[];
}
interface VideoProbe {
  streams: {
    codec_type: string;
    width?: number;
    height?: number;
    time_base?: string;
    start_pts?: number;
    duration_ts?: number;
    sample_aspect_ratio?: string;
    side_data_list?: { rotation?: number }[];
    tags?: { rotate?: string };
  }[];
}

/** FFprobe inspects the actual video stream, never the longer container/audio duration. */
export async function inspectTemplateVideo(
  path: string,
): Promise<
  Pick<
    VideoAsset,
    "duration" | "firstTimestamp" | "timeResolution" | "orientation" | "width" | "height"
  >
> {
  const { stdout } = await execute(
    "ffprobe",
    ["-v", "error", "-show_streams", "-of", "json", path],
    { maxBuffer: 1024 * 1024 },
  );
  return parseTemplateVideoProbe(JSON.parse(stdout) as VideoProbe);
}

export function parseTemplateVideoProbe(
  probe: VideoProbe,
): Awaited<ReturnType<typeof inspectTemplateVideo>> {
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (
    !video?.width ||
    !video.height ||
    !video.time_base ||
    !Number.isSafeInteger(video.duration_ts) ||
    video.duration_ts! <= 0 ||
    !Number.isSafeInteger(video.start_pts)
  )
    throw Error("The template video requires finite stream PTS/duration metadata.");
  const [numerator, denominator] = video.time_base.split("/").map(Number);
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator! <= 0 ||
    denominator! <= 0
  )
    throw Error("Unsupported template video timebase.");
  const [parN, parD] = (video.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  if (!Number.isSafeInteger(parN) || !Number.isSafeInteger(parD) || parN! <= 0 || parD! <= 0)
    throw Error("Unsupported template pixel aspect ratio.");
  const rawRotation =
    video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ??
    Number(video.tags?.rotate ?? 0);
  const rotation = ((rawRotation % 360) + 360) % 360;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
    throw Error("Unsupported template orientation.");
  const sourceWidth = (video.width * parN!) / parD!,
    sourceHeight = video.height;
  if (!Number.isInteger(sourceWidth)) throw Error("Template display dimensions must be integral.");
  return {
    width: rotation === 90 || rotation === 270 ? sourceHeight : sourceWidth,
    height: rotation === 90 || rotation === 270 ? sourceWidth : sourceHeight,
    duration: { value: video.duration_ts! * numerator!, rate: denominator! },
    firstTimestamp: { value: video.start_pts! * numerator!, rate: denominator! },
    timeResolution: denominator!,
    orientation: {
      rotation,
      flip: false,
      pixelAspectRatio: { numerator: parN!, denominator: parD! },
    },
  };
}

/** Originals are never rewritten. Their checked-in provenance pins the exact bytes. */
export async function readTemplateMedia(directory: string): Promise<{
  media: MotionTemplateMedia;
  originals: MotionTemplateManifest["originals"];
}> {
  const sources = JSON.parse(
    await readFile(resolve(directory, "sources.json"), "utf8"),
  ) as StockManifest;
  const photos: ImageAsset[] = [];
  let video: VideoAsset | undefined;
  const originals: MotionTemplateManifest["originals"][number][] = [];
  for (const source of sources.media) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(source.file) || source.file.includes(".."))
      throw Error("Unsafe template media path.");
    const path = resolve(directory, source.file),
      data = await readFile(path);
    if (
      data.byteLength !== source.bytes ||
      createHash("sha256").update(data).digest("hex") !== source.sha256
    )
      throw Error(`Template source bytes do not match their provenance: ${source.file}`);
    if (source.file.endsWith(".jpg"))
      photos.push({
        kind: "image",
        id: `stock-${source.id}`,
        name: source.id.replaceAll("-", " "),
        mime: "image/jpeg",
        width: source.width,
        height: source.height,
        dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
      });
    else if (source.file.endsWith(".mp4")) {
      if (video) throw Error("The current templates expect exactly one shared video original.");
      const contentRevision = `sha256:${source.sha256}`,
        originalId = `stock-video-${source.sha256}`;
      video = {
        kind: "video",
        id: `stock-${source.id}`,
        name: "Flower / MDN CC0",
        mime: "video/mp4",
        originalId,
        contentRevision,
        byteLength: data.byteLength,
        ...(await inspectTemplateVideo(path)),
      };
      if (video.width !== source.width || video.height !== source.height)
        throw Error("Video display dimensions do not match source provenance.");
      originals.push({
        originalId,
        contentRevision,
        file: `media/${source.file}`,
        byteLength: data.byteLength,
        mime: video.mime,
      });
    } else throw Error("Unsupported template stock media.");
  }
  if (!video || photos.length !== 3)
    throw Error("The Motion templates require one real video and three original photographs.");
  return { media: { photos, video }, originals };
}
