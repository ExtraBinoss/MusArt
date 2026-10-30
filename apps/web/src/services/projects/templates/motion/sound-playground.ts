import { createMotionEasingPreset as ease } from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { MotionTemplateMedia } from "./model";

/** An original six-second percussion study, authored solely through public headless commands. */
export function createSoundPlayground(media: MotionTemplateMedia) {
  if ((media.sounds?.length ?? 0) < 3)
    throw Error("Sound Playground requires three original SFX WAVs.");
  const a = new TemplateAuthor("sound-playground", "Sound Playground", 1080, 1080);
  a.commit([{ type: "updatePage", patch: { background: "#171c1d" } }]);
  const layers = [
    a.layer("text", "sound-edition", "Edition", {
      x: 64,
      y: 42,
      width: 952,
      height: 32,
      text: "MUSART  /  AN AUDIOVISUAL PLAYGROUND",
      fontFamily: "Space Grotesk",
      fontSize: 17,
      letterSpacing: 2,
      fill: "#a6b8ac",
    }),
    a.layer("text", "sound-title", "Sound in motion", {
      x: 55,
      y: 120,
      width: 970,
      height: 310,
      text: "SOUND /\nIN MOTION",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 139,
      lineHeight: 0.9,
      letterSpacing: -6,
      fill: "#eee8d9",
    }),
    a.layer("text", "sound-subtitle", "Subtitle", {
      x: 64,
      y: 420,
      width: 952,
      height: 44,
      text: "THREE SOUNDS. ONE SMALL ORCHESTRA.",
      fontFamily: "Space Grotesk",
      fontSize: 20,
      letterSpacing: 1.3,
      fill: "#a6b8ac",
    }),
    a.layer("text", "sound-footer", "Footer", {
      x: 64,
      y: 980,
      width: 952,
      height: 48,
      text: "09 SOUND CUES  /  LAYERED MOVEMENT  /  06 SEC",
      fontFamily: "Space Grotesk",
      fontSize: 18,
      letterSpacing: 1,
      fill: "#a6b8ac",
    }),
  ];
  const instruments = [
    { id: "whoosh", name: "WHOOSH", color: "#9ccbaa" },
    { id: "pop", name: "POP", color: "#db9578" },
    { id: "chime", name: "CHIME", color: "#b3a4d2" },
  ];
  instruments.forEach((item, index) => {
    const id = `sound-${item.id}`;
    layers.push(
      a.layer("group", id, item.name, { x: 64 + index * 324, y: 500, width: 304, height: 410 }),
    );
    layers.push(
      a.layer("rectangle", `${id}-card`, `${item.name} card`, {
        parentId: id,
        width: 304,
        height: 410,
        radius: 24,
        fill: item.color,
      }),
    );
    layers.push(
      a.layer("text", `${id}-number`, "Instrument number", {
        parentId: id,
        x: 22,
        y: 20,
        width: 260,
        height: 36,
        text: `0${index + 1}`,
        fontFamily: "Space Grotesk",
        fontSize: 23,
        fill: "#25352c",
      }),
    );
    layers.push(
      a.layer("text", `${id}-label`, "Instrument label", {
        parentId: id,
        x: 22,
        y: 338,
        width: 260,
        height: 48,
        text: item.name,
        fontFamily: "Space Grotesk",
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: -1,
        fill: "#25352c",
      }),
    );
  });
  [0, 1, 2].forEach((index) =>
    layers.push(
      a.layer("rectangle", `sound-wind-${index}`, "Wind ribbon", {
        parentId: "sound-whoosh",
        x: 36 + index * 18,
        y: 124 + index * 45,
        width: 200 - index * 24,
        height: 20,
        radius: 10,
        fill: "#25352c",
      }),
    ),
  );
  layers.push(
    a.layer("ellipse", "sound-pop-circle", "Pop pulse", {
      parentId: "sound-pop",
      x: 67,
      y: 112,
      width: 170,
      height: 170,
      fill: "#25352c",
    }),
  );
  layers.push(
    a.layer("ellipse", "sound-pop-core", "Pop center", {
      parentId: "sound-pop",
      x: 119,
      y: 164,
      width: 66,
      height: 66,
      fill: "#db9578",
    }),
  );
  layers.push(
    a.layer("ellipse", "sound-chime-ring", "Chime ring", {
      parentId: "sound-chime",
      x: 62,
      y: 106,
      width: 180,
      height: 180,
      fill: "#ffffff00",
      stroke: "#25352c",
      strokeWidth: 12,
    }),
  );
  layers.push(
    a.layer("ellipse", "sound-chime-moon", "Chime striker", {
      parentId: "sound-chime",
      x: 131,
      y: 64,
      width: 42,
      height: 42,
      fill: "#25352c",
    }),
  );
  a.commit([{ type: "addLayers", layers, assets: [...media.sounds!] }]);
  a.initialize();
  a.commit([{ type: "setMotionDuration", duration: seconds(6) }]);
  a.sounds(media, [
    { sound: 0, start: 0.1, volume: 0.55 },
    { sound: 1, start: 0.85, volume: 0.7 },
    { sound: 2, start: 1.4, volume: 0.55 },
    { sound: 0, start: 2.2, volume: 0.5 },
    { sound: 1, start: 2.85, volume: 0.65 },
    { sound: 2, start: 3.5, volume: 0.5 },
    { sound: 0, start: 4.25, volume: 0.45 },
    { sound: 1, start: 4.9, volume: 0.65 },
    { sound: 2, start: 4.85, volume: 0.5 },
  ]);
  a.commit(
    a.engine.getSnapshot().project.pages[0]!.motion!.audioTracks!.map((track) => ({
      type: "updateMotionAudioTrack",
      trackId: track.id,
      patch: {
        processing: {
          fadeIn: seconds(0.005),
          fadeOut: seconds(0.03),
          reverb: { mix: track.assetId === media.sounds![2]!.id ? 0.16 : 0, decay: 0.45 },
        },
      },
    })),
  );
  for (const [index, item] of instruments.entries())
    a.commit([
      ...a.layerKeys(`sound-${item.id}`, "rotation", [
        [0, 0],
        [0.1 + index * 0.65, -3, ease("easeOut")],
        [0.7 + index * 0.65, 0, ease("gentle")],
        [3, 2, ease("gentle")],
        [6, 0, ease("easeInOut")],
      ]),
      {
        type: "applyMotionTransition",
        layerId: `sound-${item.id}`,
        style: index === 0 ? "diagonal-wipe" : index === 1 ? "iris" : "fade",
        placement: "in",
        duration: seconds(0.65),
        easing: ease("easeOut"),
      },
      {
        type: "applyMotionTransition",
        layerId: `sound-${item.id}`,
        style: "fade",
        placement: "out",
        duration: seconds(0.35),
        easing: ease("easeIn"),
      },
    ]);
  [0, 1, 2].forEach((index) =>
    a.commit(
      a.layerKeys(`sound-wind-${index}`, "x", [
        [0, 36 + index * 18],
        [0.5, 66 + index * 12, ease("easeOut")],
        [2.2, 36 + index * 18, ease("gentle")],
        [2.65, 66 + index * 12, ease("easeOut")],
        [4.25, 36 + index * 18, ease("gentle")],
        [4.7, 66 + index * 12, ease("easeOut")],
        [6, 36 + index * 18, ease("easeInOut")],
      ]),
    ),
  );
  a.commit([
    ...a.layerKeys("sound-pop-core", "opacity", [
      [0, 1],
      [0.85, 1],
      [0.98, 0.1, ease("easeOut")],
      [1.35, 1, ease("gentle")],
      [2.85, 1],
      [2.98, 0.1, ease("easeOut")],
      [3.35, 1, ease("gentle")],
      [4.9, 1],
      [5.03, 0.1, ease("easeOut")],
      [5.4, 1, ease("gentle")],
    ]),
    ...a.layerKeys("sound-chime-moon", "y", [
      [0, 64],
      [1.4, 64],
      [1.65, 114, ease("easeOut")],
      [2.1, 64, ease("gentle")],
      [3.5, 64],
      [3.75, 114, ease("easeOut")],
      [4.2, 64, ease("gentle")],
      [4.85, 64],
      [5.1, 114, ease("easeOut")],
      [6, 64, ease("gentle")],
    ]),
    {
      type: "applyMotionTransition",
      layerId: "sound-title",
      style: "fade",
      placement: "in",
      duration: seconds(0.45),
      easing: ease("easeOut"),
    },
  ]);
  return a.finish();
}
