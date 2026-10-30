import { expect, it } from "vitest";
import { SFX_BANK, sfxWav, synthesizeSfx } from "../../../../src/services/motion/audio/sfx";
it("renders every original preset deterministically with finite bounded PCM and click-free edges", () => {
  expect(new Set(SFX_BANK.map((item) => item.id)).size).toBe(SFX_BANK.length);
  expect(new Set(SFX_BANK.map((item) => item.category)).size).toBe(5);
  for (const preset of SFX_BANK) {
    const a = synthesizeSfx(preset.id, 8000),
      b = synthesizeSfx(preset.id, 8000);
    expect(a).toEqual(b);
    expect(a.length).toBe(Math.round(8000 * preset.duration));
    expect(a[0]).toBe(0);
    expect(a.at(-1)).toBe(0);
    expect(a.some((value) => Math.abs(value) > 0.01)).toBe(true);
    expect(a.every((value) => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
  }
});
it("encodes a real PCM16 WAV with accurate sample length, rate and clipping", async () => {
  const samples = new Float32Array([-2, -0.5, 0, 0.5, 2]);
  const blob = sfxWav(samples, 48000);
  // jsdom Blob has no arrayBuffer; FileReader proves the actual bytes instead.
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(bytes);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
  expect(new TextDecoder().decode(bytes.slice(8, 16))).toBe("WAVEfmt ");
  expect(view.getUint32(24, true)).toBe(48000);
  expect(view.getUint32(40, true)).toBe(10);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(52, true)).toBe(32767);
  expect(() => synthesizeSfx("missing")).toThrow();
  expect(() => synthesizeSfx("soft-plop", 1)).toThrow();
  expect(() => sfxWav(new Float32Array([NaN]))).toThrow();
  expect(() => sfxWav(new Float32Array(4 * 8000), 8000)).toThrow();
});
