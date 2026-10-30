import {
  createEffect,
  createMotionEasingPreset as ease,
  EFFECT_CATALOG,
  getEffectDefinition,
  MOTION_EASING_PRESETS,
  type Command,
  type EffectType,
} from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "./model";

/** Fifty photo layers and 100 real GPU effects. Three photo originals + one video are reused. */
export function createStressTemplate(media: MotionTemplateMedia): BuiltMotionTemplate {
  if (media.photos.length < 3)
    throw Error("Motion stress lab requires three original photographs.");
  const a = new TemplateAuthor("motion-stress-lab", "Motion stress lab", 1440, 1200);
  const types = Object.keys(EFFECT_CATALOG) as EffectType[];
  const layers = [
    a.layer("rectangle", "stress-paper", "Ink paper", {
      width: 1440,
      height: 1200,
      fill: "#122520",
    }),
    a.layer("text", "stress-title", "MOTION / LAB", {
      x: 44,
      y: 32,
      width: 1120,
      height: 105,
      text: "MOTION / LAB",
      fontFamily: "Space Grotesk",
      fontSize: 86,
      fontWeight: 700,
      letterSpacing: -3,
      fill: "#e8f0c8",
    }),
    a.layer("text", "stress-caption", "Workload inventory", {
      x: 50,
      y: 144,
      width: 1330,
      height: 30,
      text: "50 PHOTO LAYERS   /   100 GPU EFFECTS   /   3 VIDEO CLIPS   /   1 SHARED ORIGINAL",
      fontSize: 17,
      fontFamily: "Space Grotesk",
      fontWeight: 400,
      letterSpacing: 1.3,
      fill: "#bacdb7",
    }),
  ];
  for (let index = 0; index < 50; index++) {
    const photo = media.photos[index % media.photos.length]!;
    const height = (126 * photo.height) / photo.width;
    layers.push(
      a.layer(
        "image",
        `stress-photo-${index}`,
        `${String(index + 1).padStart(2, "0")} / ${photo.name}`,
        {
          x: 46 + (index % 10) * 135,
          y: 218 + Math.floor(index / 10) * 130 + (117 - height) / 2,
          width: 126,
          height,
          assetId: photo.id,
          effects: [0, 1].map((slot) => {
            const type = types[(index * 2 + slot) % types.length]!;
            const defaults = getEffectDefinition(type).defaults;
            return createEffect(type, {
              id: `stress-fx-${index}-${slot}`,
              seed: 700 + index * 2 + slot,
              amount: defaults.amount === 0.5 ? 0.53 : 0.32,
              color: true,
              ...(defaults.time === undefined ? {} : { time: 0 }),
            });
          }),
        },
      ),
    );
  }
  for (let index = 0; index < 3; index++)
    layers.push(
      a.layer(
        "video",
        `stress-video-${index}`,
        `Footage ${index + 1} / shared original${index ? " / muted" : " + audio"}`,
        {
          x: 46 + index * 455,
          y: 900,
          width: 438,
          height: 246.375,
          assetId: media.video.id,
        },
      ),
    );
  a.add(layers, media);
  const groups = Array.from({ length: 5 }, (_, row) => {
    const ids = Array.from({ length: 10 }, (_, column) => `stress-photo-${row * 10 + column}`);
    const group = a.group(ids, `Photo row ${row + 1} / isolated group`, {
      x: 46,
      y: 218 + row * 130,
      width: 1341,
      height: 117,
    });
    a.commit([
      {
        type: "updateLayerPatches",
        patches: ids.map((id, column) => {
          const layer = layers.find((item) => item.id === id)!;
          return { id, patch: { x: column * 135, y: (117 - layer.height) / 2 } };
        }),
      },
    ]);
    return group;
  });
  a.initialize();
  const commands: Command[] = [];
  for (let index = 0; index < 50; index++) {
    const layer = layers.find((item) => item.id === `stress-photo-${index}`)!;
    const incoming = ease(MOTION_EASING_PRESETS[index % MOTION_EASING_PRESETS.length]!);
    const delay = (index % 10) * 0.035;
    commands.push(
      ...a.layerKeys(layer.id, "rotation", [
        [0, -3 + (index % 7)],
        [1 + delay, 2 - (index % 5), incoming],
        [4.9, -3 + (index % 7), ease("easeInOut")],
      ]),
      ...a.layerKeys(layer.id, "opacity", [
        [0, 0.2],
        [0.5 + delay, 1, ease("easeOut")],
        [4.8, 1],
      ]),
    );
    for (const effect of layer.effects) {
      commands.push(
        ...a.keys({ kind: "effect", layerId: layer.id, effectId: effect.id, property: "amount" }, [
          [0, effect.amount],
          [2.5, Math.min(0.72, effect.amount + 0.18), incoming],
          [5, effect.amount, ease("easeInOut")],
        ]),
      );
      if (
        getEffectDefinition(effect.type).parameters.some(
          (parameter) => parameter.scope !== "settings" && parameter.key === "time",
        )
      )
        commands.push(
          ...a.keys({ kind: "effect", layerId: layer.id, effectId: effect.id, property: "time" }, [
            [0, 0],
            [5, 5, ease("linear")],
          ]),
        );
    }
  }
  for (const [index, id] of groups.entries())
    commands.push(
      ...a.layerKeys(id, "x", [
        [0, 46],
        [2.5, index % 2 ? 38 : 54, { type: "spring", bounce: 0.35, response: 9 }],
        [5, 46, ease("easeInOut")],
      ]),
    );
  const clips = [
    { start: 0, end: 5, sourceIn: 0, mute: false, volume: 0.5 },
    { start: 0.8, end: 4.5, sourceIn: 0.2, mute: true, volume: 0.8 },
    { start: 2, end: 5, sourceIn: 0.5, mute: true, volume: 1 },
  ];
  for (const [index, clip] of clips.entries()) {
    const trackId = a.track(`stress-video-${index}`);
    commands.push(
      { type: "setMotionTrackRange", trackId, start: seconds(clip.start), end: seconds(clip.end) },
      {
        type: "setMotionMedia",
        trackId,
        patch: { sourceIn: seconds(clip.sourceIn), mute: clip.mute, volume: clip.volume },
      },
    );
  }
  // Keep each validated engine transaction below its 1000-command admission limit.
  for (let offset = 0; offset < commands.length; offset += 500)
    a.commit(commands.slice(offset, offset + 500));
  a.sounds(media, [
    { sound: 0, start: 0, volume: 0.4 },
    { sound: 1, start: 0.8, volume: 0.5 },
    { sound: 1, start: 2, volume: 0.45 },
    { sound: 2, start: 3.2, volume: 0.3 },
  ]);
  return a.finish();
}
