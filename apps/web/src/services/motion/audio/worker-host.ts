import type { OriginalMediaAsset } from "@musart/core";
import { prepareAudioPeaks, prepareSfxPeaks } from "./peaks";
import { sfxWav, synthesizeSfx } from "./sfx";
export type AudioWorkerJob =
  | { id: number; type: "waveform"; asset: OriginalMediaAsset; original: Blob }
  | { id: number; type: "sfx"; preset: string };
export type AudioWorkerReply =
  | { id: number; peaks: Float32Array<ArrayBuffer> }
  | { id: number; blob: Blob; peaks?: Float32Array<ArrayBuffer> }
  | { id: number; error: string };

export async function handleAudioWorkerJob(job: AudioWorkerJob): Promise<AudioWorkerReply> {
  try {
    if (job.type === "waveform")
      return { id: job.id, peaks: await prepareAudioPeaks(job.asset, job.original) };
    const samples = synthesizeSfx(job.preset);
    return { id: job.id, blob: sfxWav(samples), peaks: prepareSfxPeaks(samples) };
  } catch (error) {
    return {
      id: job.id,
      error: error instanceof Error ? error.message : "Audio preparation failed.",
    };
  }
}
