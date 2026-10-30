import { encodeSfxWav, synthesizeSfx } from "../sfx";
import type { BankPcm } from "./model";

/** Bank originals carry no authored FX: read the exact PCM16 WAV quantization in the worker. */
export async function prepareBankPcm(preset: string): Promise<BankPcm> {
  const wav = encodeSfxWav(synthesizeSfx(preset)),
    view = new DataView(wav),
    frames = (wav.byteLength - 44) / 2;
  const pcm = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++)
    pcm[frame] = view.getInt16(44 + frame * 2, true) / 32768;
  const digest = await crypto.subtle.digest("SHA-256", wav),
    revision = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  return { preset, revision, frames, pcm, blob: new Blob([wav], { type: "audio/wav" }) };
}
