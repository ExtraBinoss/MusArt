import { expect, test } from "vitest";
import {
  EditorEngine,
  compileMotion,
  serializeProject,
  validateProject,
  evaluateMotion,
} from "@musart/core";
import { createSoundPlayground } from "../../../../../src/services/projects/templates/motion/sound-playground";
import { templateMedia } from "../../../../support/motion-template-media";
import { SFX_BANK, sfxWav, synthesizeSfx } from "../../../../../src/services/motion/audio/sfx";
export function soundMedia() {
  const media = templateMedia();
  return {
    ...media,
    sounds: ["silk-whoosh", "soft-plop", "glass-chime"].map((id) => {
      const duration = SFX_BANK.find((item) => item.id === id)!.duration;
      return {
        id: `sfx-${id}`,
        name: id,
        kind: "audio" as const,
        mime: "audio/wav",
        originalId: `original-${id}`,
        contentRevision: `revision-${id}`,
        byteLength: sfxWav(synthesizeSfx(id)).size,
        duration: { value: Math.round(duration * 48000), rate: 48000 },
        firstTimestamp: { value: 0, rate: 1 },
        timeResolution: 48000,
        sampleRate: 48000,
        channels: 1 as const,
      };
    }),
  };
}
test("authors an original, replayable audio-only animation with grouped instruments and real transition commands", () => {
  const media = soundMedia(),
    result = createSoundPlayground(media);
  validateProject(result.project);
  expect(serializeProject(createSoundPlayground(media).project)).toBe(
    serializeProject(result.project),
  );
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!,
    program = compileMotion(result.project, { compositionId: page.id });
  expect(Object.values(result.project.assets).map((asset) => asset.kind)).toEqual([
    "audio",
    "audio",
    "audio",
  ]);
  expect(page.layers.filter((layer) => layer.kind === "group")).toHaveLength(3);
  expect(page.layers.some((layer) => layer.kind === "video" || layer.kind === "image")).toBe(false);
  expect(program.audio).toHaveLength(9);
  expect(program.layers.every((layer) => !layer.media)).toBe(true);
  expect(page.motion!.duration.value / page.motion!.duration.rate).toBe(6);
  expect(page.motion!.audioTracks!.some((track) => track.processing!.reverb.mix > 0)).toBe(true);
  expect(
    page.layers.some((layer) => layer.effects.some((effect) => effect.type === "transition")),
  ).toBe(true);
  const frame = evaluateMotion(program, { value: 950, rate: 1000 });
  evaluateMotion(program, { value: 5, rate: 1 });
  expect(evaluateMotion(program, { value: 950, rate: 1000 })).toEqual(frame);
});
test("refuses incomplete sound sources rather than inserting silent placeholders", () => {
  expect(() => createSoundPlayground(templateMedia())).toThrow("three original SFX WAVs");
});
