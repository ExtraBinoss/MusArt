import { motionTimeToSeconds, type VideoAsset } from "@musart/core";
import {
  ALL_FORMATS,
  BlobSource,
  canEncodeVideo,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
} from "mediabunny";
import { probeVideoOriginal } from "../probe";
import { videoProxyProfile, videoProxyProfileKey, type VideoProxyProfile } from "./profile";
import type { VideoProxy } from "./model";

/** Native conversion, no pixel readback. The write target enforces its limit before accepting bytes. */
export async function prepareVideoProxy(
  asset: VideoAsset,
  original: Blob,
  configuration?: Partial<VideoProxyProfile>,
  control?: { execute(conversion: Conversion): Promise<void> },
): Promise<VideoProxy> {
  const profile = videoProxyProfile(configuration),
    maxEdge = profile.maxEdge;
  if (original.size !== asset.byteLength)
    throw Error("Video proxy original does not match its immutable asset.");
  const originalMetadata = await probeVideoOriginal(original);
  if (originalMetadata.width !== asset.width || originalMetadata.height !== asset.height)
    throw Error("Video proxy original dimensions changed.");
  const ratio = Math.min(1, maxEdge / Math.max(asset.width, asset.height));
  const width = Math.max(2, Math.round((asset.width * ratio) / 2) * 2),
    height = Math.max(2, Math.round((asset.height * ratio) / 2) * 2);
  const quality = new Quality({ bitrate: profile.bitrate, bitrateMode: "variable" });
  const codec = (await canEncodeVideo("avc", { width, height, quality })) ? "avc" : "vp8";
  if (!(await canEncodeVideo(codec, { width, height, quality })))
    throw Error("No native encoder is available for video preview proxies.");
  const buffer = new Uint8Array(profile.maxBytes);
  let length = 0;
  const target = new StreamTarget(
    new WritableStream({
      write(chunk) {
        const after = chunk.position + chunk.data.byteLength;
        if (!Number.isSafeInteger(after) || chunk.position < 0 || after > profile.maxBytes)
          throw Error("Video proxy exceeds its configured preview budget.");
        buffer.set(chunk.data, chunk.position);
        length = Math.max(length, after);
      },
    }),
    { chunked: true, chunkSize: 256 * 1024 },
  );
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  const output = new Output({
    target,
    format:
      codec === "avc" ? new Mp4OutputFormat({ fastStart: "fragmented" }) : new WebMOutputFormat(),
  });
  let conversion: Conversion | null = null;
  try {
    conversion = await Conversion.init({
      input,
      output,
      video: {
        width,
        height,
        fit: "contain",
        codec,
        quality,
        keyFrameInterval: profile.keyFrameInterval,
        allowTransformationMetadata: false,
      },
      audio: { discard: true },
    });
    if (!conversion.isValid) throw Error("Native video proxy conversion is not supported.");
    if (control) await control.execute(conversion);
    else await conversion.execute();
    const blob = new Blob([buffer.subarray(0, length)], {
      type: codec === "avc" ? "video/mp4" : "video/webm",
    });
    const metadata = await probeVideoOriginal(blob);
    if (
      Math.abs(motionTimeToSeconds(metadata.duration) - motionTimeToSeconds(asset.duration)) >
      Math.max(1 / asset.timeResolution, 1 / metadata.timeResolution) * 2
    )
      throw Error("Video proxy changed the playable source duration.");
    return {
      original: blob,
      asset: {
        ...asset,
        ...metadata,
        mime: blob.type,
        byteLength: blob.size,
        originalId: `${asset.originalId}:preview-v1:${videoProxyProfileKey(profile)}`,
        contentRevision: `${asset.contentRevision}:preview-v1:${videoProxyProfileKey(profile)}`,
      },
    };
  } finally {
    if (conversion && conversion.state !== "done") await conversion.cancel();
    input.dispose();
  }
}
