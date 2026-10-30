import { ensure } from "../errors";
import { freezeValue } from "../document/immutable";
import { assertEditable, getLayer } from "../layers/access";
import type { MotionProgram } from "./compile";
import type { MotionPropertyTrack } from "./model";
import { compileMotionInterpolator } from "./interpolation";
import { resolveMotionProperty } from "./properties/registry";
import { addMotionTime, compareMotionTime, validateMotionTime, type MotionTime } from "./time";

/** Capture once; retime only affected properties without copying/validating a project per frame.
 * The returned programs are presentation drafts. The canonical composition stays untouched.
 */
export function createMotionKeyframePreview(
  program: MotionProgram,
  keyframeIds: readonly string[],
) {
  ensure(program.mode === "motion", "INVALID_COMMAND", "Composition is not in Motion mode");
  const ids = new Set(keyframeIds);
  ensure(
    ids.size > 0 && ids.size <= 100000 && ids.size === keyframeIds.length,
    "INVALID_COMMAND",
    "Invalid keyframe selection",
  );
  const found = new Set<string>();
  const tracks = new Map(program.composition.motion?.tracks.map((track) => [track.id, track]));
  const affected = new Map(
    program.layers.flatMap((layer, layerIndex) => {
      const track = layer.trackId ? tracks.get(layer.trackId) : undefined;
      const properties = (track?.properties ?? []).filter(
        (property) => property.keyframes.length > 0,
      );
      const entries = properties.flatMap((property, propertyIndex) => {
        if (!property.keyframes.some((key) => ids.has(key.id))) return [];
        assertEditable(program.composition, getLayer(program.composition, layer.id));
        const descriptor = resolveMotionProperty(program.composition, property.target);
        ensure(descriptor, "INVALID_DOCUMENT", "Unknown Motion property");
        for (const key of property.keyframes) if (ids.has(key.id)) found.add(key.id);
        return [{ propertyIndex, property, descriptor }];
      });
      return entries.length ? [[layerIndex, entries] as const] : [];
    }),
  );
  ensure(found.size === ids.size, "NOT_FOUND", "Selected keyframe not found");
  const constraints = [...affected.values()].flat().map(({ property }) => ({
    moving: property.keyframes.filter((key) => ids.has(key.id)),
    fixed: property.keyframes.filter((key) => !ids.has(key.id)),
  }));
  const accepts = (delta: MotionTime): boolean => {
    try {
      validateMotionTime(delta);
      for (const { moving, fixed } of constraints) {
        if (
          program.composition.motion!.version !== 2 &&
          addMotionTime(moving[0]!.time, delta).value < 0
        )
          return false;
        if (!fixed.length) continue;
        for (const key of moving) {
          const time = addMotionTime(key.time, delta);
          let low = 0,
            high = fixed.length;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if (compareMotionTime(fixed[middle]!.time, time) < 0) low = middle + 1;
            else high = middle;
          }
          if (fixed[low] && compareMotionTime(fixed[low]!.time, time) === 0) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  };
  const sample = (delta: MotionTime): MotionProgram => {
    validateMotionTime(delta);
    if (delta.value === 0) return program;
    const authored = new Map<string, MotionPropertyTrack>();
    const layers = program.layers.map((layer, layerIndex) => {
      const entries = affected.get(layerIndex);
      if (!entries) return layer;
      const properties = [...layer.properties];
      for (const { propertyIndex, property, descriptor } of entries) {
        const keys = property.keyframes
          .map((key, index) => ({
            key,
            index,
            time: ids.has(key.id) ? addMotionTime(key.time, delta) : key.time,
          }))
          .sort((a, b) => compareMotionTime(a.time, b.time));
        ensure(
          program.composition.motion!.version === 2 || keys[0]!.time.value >= 0,
          "INVALID_COMMAND",
          "Negative keyframe time",
        );
        ensure(
          keys.every(
            (key, index) => index === 0 || compareMotionTime(keys[index - 1]!.time, key.time) < 0,
          ),
          "INVALID_COMMAND",
          "Keyframe time is already occupied",
        );
        const previous = layer.properties[propertyIndex]!;
        const authoredKeys = keys.map(({ key, time }) =>
          time === key.time ? key : { ...key, time },
        );
        authored.set(property.id, { ...property, keyframes: authoredKeys });
        properties[propertyIndex] = freezeValue({
          target: previous.target,
          keys: authoredKeys,
          segments: keys.every((key, index) => key.index === index)
            ? previous.segments
            : keys
                .slice(1)
                .map(({ key }, index) =>
                  compileMotionInterpolator(
                    descriptor,
                    keys[index]!.key.value,
                    key.value,
                    key.easing,
                  ),
                ),
        });
      }
      return Object.freeze({ ...layer, properties: Object.freeze(properties) });
    });
    const motion = program.composition.motion!;
    const composition = freezeValue({
      ...program.composition,
      motion: {
        ...motion,
        tracks: motion.tracks.map((track) =>
          track.properties.some((property) => authored.has(property.id))
            ? {
                ...track,
                properties: track.properties.map(
                  (property) => authored.get(property.id) ?? property,
                ),
              }
            : track,
        ),
      },
    });
    return Object.freeze({ ...program, composition, layers: Object.freeze(layers) });
  };
  return Object.freeze({ accepts, sample });
}
