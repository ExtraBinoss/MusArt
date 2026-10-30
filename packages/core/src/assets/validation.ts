import { assertBoolean, assertNumber, assertRecord, assertText } from "../document/guards";
import { ensure } from "../errors";
import { validateMotionTime } from "../motion/time";

export function validateAssetDescription(asset: Record<string, unknown>): void {
  assertText(asset.name);
  assertText(asset.mime, 128);
  if (asset.kind === "audio") {
    ensure(
      Object.keys(asset).every((key) =>
        [
          "id",
          "kind",
          "name",
          "mime",
          "originalId",
          "contentRevision",
          "byteLength",
          "duration",
          "firstTimestamp",
          "timeResolution",
          "sampleRate",
          "channels",
        ].includes(key),
      ),
      "INVALID_DOCUMENT",
      "Audio descriptions contain metadata only",
    );
    ensure(/^audio\/[\w.+-]+$/.test(asset.mime), "INVALID_DOCUMENT", "Unsupported audio MIME type");
    ensure(
      !Object.hasOwn(asset, "dataUrl") &&
        !Object.hasOwn(asset, "blob") &&
        !Object.hasOwn(asset, "width") &&
        !Object.hasOwn(asset, "height"),
      "INVALID_DOCUMENT",
      "Audio must remain a nonvisual binary original",
    );
    assertText(asset.originalId, 256);
    assertText(asset.contentRevision, 256);
    ensure(
      Number.isSafeInteger(asset.byteLength) && Number(asset.byteLength) > 0,
      "INVALID_DOCUMENT",
      "Invalid audio byte length",
    );
    validateMotionTime(asset.duration);
    validateMotionTime(asset.firstTimestamp);
    ensure(asset.duration.value > 0, "INVALID_DOCUMENT", "Invalid audio duration");
    ensure(
      Number.isSafeInteger(asset.timeResolution) && Number(asset.timeResolution) > 0,
      "INVALID_DOCUMENT",
      "Invalid audio timebase",
    );
    assertNumber(asset.sampleRate, 8000, 192000);
    ensure(
      Number.isInteger(asset.sampleRate) && (asset.channels === 1 || asset.channels === 2),
      "INVALID_DOCUMENT",
      "Audio requires a mono/stereo original at 8–192 kHz",
    );
    return;
  }
  assertNumber(asset.width, 1, 32768);
  assertNumber(asset.height, 1, 32768);
  if (asset.kind === "video") {
    ensure(/^video\/[\w.+-]+$/.test(asset.mime), "INVALID_DOCUMENT", "Unsupported video MIME type");
    ensure(
      !Object.hasOwn(asset, "dataUrl") && !Object.hasOwn(asset, "blob"),
      "INVALID_DOCUMENT",
      "Video originals must remain external binary records",
    );
    assertText(asset.originalId, 256);
    assertText(asset.contentRevision, 256);
    ensure(
      Number.isSafeInteger(asset.byteLength) && Number(asset.byteLength) > 0,
      "INVALID_DOCUMENT",
      "Invalid video byte length",
    );
    validateMotionTime(asset.duration);
    validateMotionTime(asset.firstTimestamp);
    ensure(asset.duration.value > 0, "INVALID_DOCUMENT", "Invalid video duration");
    ensure(
      Number.isSafeInteger(asset.timeResolution) && Number(asset.timeResolution) > 0,
      "INVALID_DOCUMENT",
      "Invalid video timebase",
    );
    assertRecord(asset.orientation);
    ensure(
      typeof asset.orientation.rotation === "number" &&
        [0, 90, 180, 270].includes(asset.orientation.rotation),
      "INVALID_DOCUMENT",
      "Invalid video rotation",
    );
    assertBoolean(asset.orientation.flip);
    assertRecord(asset.orientation.pixelAspectRatio);
    for (const value of [
      asset.orientation.pixelAspectRatio.numerator,
      asset.orientation.pixelAspectRatio.denominator,
    ])
      ensure(
        Number.isSafeInteger(value) && Number(value) > 0,
        "INVALID_DOCUMENT",
        "Invalid video pixel aspect ratio",
      );
    return;
  }
  ensure(
    asset.kind === undefined || asset.kind === "image",
    "INVALID_DOCUMENT",
    "Unknown asset kind",
  );
  ensure(
    /^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(asset.mime),
    "INVALID_DOCUMENT",
    "Unsupported image MIME type",
  );
  assertText(asset.dataUrl, 200_000_000);
  ensure(
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml|avif)(?:;[^,]*)?,/.test(asset.dataUrl),
    "INVALID_DOCUMENT",
    "Image original is not embedded",
  );
}
