import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { prepareBankPcm } from "../../../../../src/services/motion/audio/bank/prepare";
import { encodeSfxWav, synthesizeSfx } from "../../../../../src/services/motion/audio/sfx";
it.each(["soft-plop", "air-sweep", "low-pulse"])(
  "prepares %s exactly from its original quantized WAV, never a different preview synthesis",
  async (id) => {
    const result = await prepareBankPcm(id),
      wav = encodeSfxWav(synthesizeSfx(id)),
      view = new DataView(wav),
      expected = new Float32Array(result.frames);
    for (let frame = 0; frame < result.frames; frame++)
      expected[frame] = view.getInt16(44 + frame * 2, true) / 32768;
    expect(result.pcm).toEqual(expected);
    expect(result.revision).toBe(
      `sha256:${createHash("sha256").update(new Uint8Array(wav)).digest("hex")}`,
    );
    expect(await result.blob.arrayBuffer()).toEqual(wav);
    expect(result.blob.type).toBe("audio/wav");
  },
);
it("reports an unknown recipe rather than preparing a silent substitute", async () => {
  await expect(prepareBankPcm("missing")).rejects.toThrow("Unknown sound preset");
});
