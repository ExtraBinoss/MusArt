import type { Composition } from "../document/model";
import { assertList, assertRecord, assertUniqueId } from "../document/guards";
import { ensure } from "../errors";
import {
  addMotionTime,
  subtractMotionTime,
  compareMotionTime,
  validateMotionTime,
  validateMotionFrameRate,
  type MotionTime,
} from "./time";
import type { Asset } from "../assets/model";
import { isVideoAsset } from "../assets/identity";
import { validateMotionEasing } from "./easing";
import { resolveMotionProperty, validateMotionValue } from "./properties/registry";
import type { MotionPropertyTarget } from "./properties/model";

/** Called after the canonical layer graph is validated. Portable data stays inert. */
export function validateCompositionMotion(
  page: Composition,
  ids: Set<string>,
  assets?: Readonly<Record<string, Asset>>,
): void {
  const motion: unknown = page.motion;
  if (motion === undefined) return;
  assertRecord(motion);
  ensure(
    motion.version === 1 && motion.initialized === true,
    "INVALID_DOCUMENT",
    "Invalid Motion version",
  );
  ensure(
    motion.mode === "static" || motion.mode === "motion",
    "INVALID_DOCUMENT",
    "Invalid composition mode",
  );
  validateMotionTime(motion.duration);
  ensure(motion.duration.value > 0, "INVALID_DOCUMENT", "Invalid Motion duration");
  validateMotionFrameRate(motion.frameRate);
  assertList(motion.tracks, 10000);
  const layerIds = new Set(page.layers.map((layer) => layer.id));
  const tracked = new Set<string>();
  let keys = 0;
  for (const track of motion.tracks) {
    assertRecord(track);
    assertUniqueId(track.id, ids);
    ensure(
      typeof track.layerId === "string" &&
        layerIds.has(track.layerId) &&
        !tracked.has(track.layerId),
      "INVALID_DOCUMENT",
      "Invalid Motion layer track",
    );
    tracked.add(track.layerId);
    validateMotionTime(track.start);
    let sourceIn: MotionTime = { value: 0, rate: 1 };
    if (track.media !== undefined) {
      const layer = page.layers.find((item) => item.id === track.layerId);
      ensure(layer?.kind === "video", "INVALID_DOCUMENT", "Media settings require a video track");
      assertRecord(track.media);
      validateMotionTime(track.media.sourceIn);
      sourceIn = track.media.sourceIn;
      ensure(
        track.media.sourceIn.value >= 0 &&
          typeof track.media.mute === "boolean" &&
          typeof track.media.volume === "number" &&
          Number.isFinite(track.media.volume) &&
          track.media.volume >= 0 &&
          track.media.volume <= 2,
        "INVALID_DOCUMENT",
        "Invalid video source/audio settings",
      );
    }
    if (track.end !== null) {
      validateMotionTime(track.end);
      ensure(
        compareMotionTime(track.end, track.start) > 0,
        "INVALID_DOCUMENT",
        "Invalid Motion interval",
      );
    }
    const boundLayer = page.layers.find((item) => item.id === track.layerId);
    const asset = boundLayer?.assetId ? assets?.[boundLayer.assetId] : undefined;
    if (asset && isVideoAsset(asset)) {
      ensure(
        compareMotionTime(sourceIn, asset.duration) < 0,
        "INVALID_DOCUMENT",
        "Video source in-point is outside its original",
      );
      const end = track.end ?? motion.duration;
      if (compareMotionTime(end, track.start) > 0)
        ensure(
          compareMotionTime(
            addMotionTime(sourceIn, subtractMotionTime(end, track.start)),
            asset.duration,
          ) <= 0,
          "INVALID_DOCUMENT",
          "Video trim exceeds the original source range",
        );
    }
    assertList(track.properties, 1024);
    const addresses = new Set<string>();
    for (const property of track.properties) {
      assertRecord(property);
      assertUniqueId(property.id, ids);
      assertRecord(property.target);
      const allowed =
        property.target.kind === "layer"
          ? ["kind", "layerId", "property"]
          : ["kind", "layerId", "effectId", "property"];
      ensure(
        Object.keys(property.target).every((key) => allowed.includes(key)),
        "INVALID_DOCUMENT",
        "Unknown Motion target field",
      );
      ensure(
        property.target.layerId === track.layerId,
        "INVALID_DOCUMENT",
        "Mismatched Motion target",
      );
      const descriptor = resolveMotionProperty(
        page,
        property.target as unknown as MotionPropertyTarget,
      );
      ensure(descriptor, "INVALID_DOCUMENT", "Unknown Motion property");
      const address = JSON.stringify([
        property.target.kind,
        property.target.layerId,
        property.target.kind === "layer" ? null : property.target.effectId,
        property.target.property,
      ]);
      ensure(!addresses.has(address), "INVALID_DOCUMENT", "Duplicate Motion property");
      addresses.add(address);
      assertList(property.keyframes, 100000);
      let previous;
      for (const key of property.keyframes) {
        ensure(++keys <= 100000, "INVALID_DOCUMENT", "Too many Motion keys");
        assertRecord(key);
        assertUniqueId(key.id, ids);
        validateMotionTime(key.time);
        ensure(
          key.time.value >= 0 && (!previous || compareMotionTime(previous, key.time) < 0),
          "INVALID_DOCUMENT",
          "Unordered or duplicate Motion key time",
        );
        validateMotionValue(descriptor, key.value);
        if (key.easing !== undefined) validateMotionEasing(key.easing);
        previous = key.time;
      }
    }
  }
}
