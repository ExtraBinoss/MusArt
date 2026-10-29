import type { Composition } from "../document/model";
import { assertList, assertRecord, assertUniqueId } from "../document/guards";
import { ensure } from "../errors";
import { compareMotionTime, validateMotionTime, validateMotionFrameRate } from "./time";
import { validateMotionEasing } from "./easing";
import { resolveMotionProperty, validateMotionValue } from "./properties/registry";
import type { MotionPropertyTarget } from "./properties/model";

/** Called after the canonical layer graph is validated. Portable data stays inert. */
export function validateCompositionMotion(page: Composition, ids: Set<string>): void {
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
    if (track.end !== null) {
      validateMotionTime(track.end);
      ensure(
        compareMotionTime(track.end, track.start) > 0,
        "INVALID_DOCUMENT",
        "Invalid Motion interval",
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
