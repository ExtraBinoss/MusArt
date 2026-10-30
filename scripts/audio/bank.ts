import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SFX_BANK,
  SFX_RECIPE_VERSION,
  encodeSfxWav,
  synthesizeSfx,
} from "../../apps/web/src/services/motion/audio/sfx";
import type { BankShapeData } from "../../apps/web/src/services/motion/audio/bank/model";

/** Build-time genuine original envelopes: bank opening never computes audio waveforms. */
export function generateBankShapes(): BankShapeData {
  return {
    version: 1,
    recipeVersion: SFX_RECIPE_VERSION,
    sampleRate: 48000,
    bins: 96,
    shapes: SFX_BANK.map((preset) => {
      const wav = encodeSfxWav(synthesizeSfx(preset.id)),
        view = new DataView(wav),
        frames = (wav.byteLength - 44) / 2,
        peaks = new Uint16Array(96);
      for (let frame = 0; frame < frames; frame++) {
        const bin = Math.min(95, Math.floor((frame / frames) * 96));
        peaks[bin] = Math.max(peaks[bin]!, Math.abs(view.getInt16(44 + frame * 2, true)));
      }
      const bytes = new Uint8Array(192);
      for (let bin = 0; bin < 96; bin++) {
        bytes[bin * 2] = peaks[bin]! & 255;
        bytes[bin * 2 + 1] = peaks[bin]! >> 8;
      }
      return {
        id: preset.id,
        frames,
        revision: `sha256:${createHash("sha256").update(new Uint8Array(wav)).digest("hex")}`,
        peaks: Buffer.from(bytes).toString("base64"),
      };
    }),
  };
}
export async function writeBankShapes(
  path = resolve("apps/web/src/services/motion/audio/bank/shapes.json"),
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(generateBankShapes(), null, 2) + "\n");
}
if (import.meta.main) await writeBankShapes();
