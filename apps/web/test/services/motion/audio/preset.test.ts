import { expect, it } from "vitest";
import { createPresetAudition } from "../../../../src/services/motion/audio/preset";
import { sfxWav, synthesizeSfx } from "../../../../src/services/motion/audio/sfx";
it("routes the genuine synthesized WAV through a compact original-backed worker plan", () => {
  const blob = sfxWav(synthesizeSfx("soft-plop")),
    { asset, plan } = createPresetAudition("soft-plop", blob);
  expect(asset.byteLength).toBe(blob.size);
  expect(asset.duration.value).toBe((blob.size - 44) / 2);
  expect(plan.layers).toEqual([]);
  expect(plan.audio[0]!.media.assetId).toBe(asset.id);
  expect(plan.audio[0]!.media.volume).toBe(1);
  expect(() => createPresetAudition("missing", blob)).toThrow("Unknown sound");
  expect(() => createPresetAudition("soft-plop", new Blob(["bad"]))).toThrow("WAV original");
});
