import { ensure } from "../errors";
import { freezeValue } from "../document/immutable";
import { assertEditable, getLayer } from "../layers/access";
import type { MotionProgram } from "./compile";
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
  let found = 0;
  const affected = new Map(
    program.layers.flatMap((layer, layerIndex) => {
      const track = program.composition.motion?.tracks.find((item) => item.layerId === layer.id);
      const properties = (track?.properties ?? []).filter(
        (property) => property.keyframes.length > 0,
      );
      const entries = properties.flatMap((property, propertyIndex) => {
        if (!property.keyframes.some((key) => ids.has(key.id))) return [];
        assertEditable(program.composition, getLayer(program.composition, layer.id));
        const descriptor = resolveMotionProperty(program.composition, property.target);
        ensure(descriptor, "INVALID_DOCUMENT", "Unknown Motion property");
        found += property.keyframes.filter((key) => ids.has(key.id)).length;
        return [{ propertyIndex, property, descriptor }];
      });
      return entries.length ? [[layerIndex, entries] as const] : [];
    }),
  );
  ensure(found === ids.size, "NOT_FOUND", "Selected keyframe not found");
  return (delta: MotionTime): MotionProgram => {
    validateMotionTime(delta);
    if (delta.value === 0) return program;
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
        ensure(keys[0]!.time.value >= 0, "INVALID_COMMAND", "Negative keyframe time");
        ensure(
          keys.every(
            (key, index) => index === 0 || compareMotionTime(keys[index - 1]!.time, key.time) < 0,
          ),
          "INVALID_COMMAND",
          "Keyframe time is already occupied",
        );
        const previous = layer.properties[propertyIndex]!;
        properties[propertyIndex] = freezeValue({
          target: previous.target,
          keys: keys.map(({ key, time }) => ({ time, value: key.value })),
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
    return Object.freeze({ ...program, layers: Object.freeze(layers) });
  };
}
