import type { AudioAsset } from "@musart/core";
import type { MotionAudioPlan } from "@musart/render";
import { SFX_BANK } from "./sfx";

/** Temporary immutable native original, decoded by the same worker mixer as imported clips. */
export function createPresetAudition(
  id: string,
  blob: Blob,
): { asset: AudioAsset; plan: MotionAudioPlan } {
  const preset = SFX_BANK.find((item) => item.id === id);
  if (!preset) throw Error("Unknown sound preset.");
  const samples = Math.round(preset.duration * 48000);
  if (blob.type !== "audio/wav" || blob.size !== 44 + samples * 2)
    throw Error("The sound preview does not match its WAV original.");
  const zero = { value: 0, rate: 1 },
    duration = { value: samples, rate: 48000 };
  const asset: AudioAsset = {
    id: `preview-${id}`,
    kind: "audio",
    name: preset.name,
    mime: "audio/wav",
    originalId: `preview-${id}`,
    contentRevision: `sfx-v1-${id}`,
    byteLength: blob.size,
    duration,
    firstTimestamp: zero,
    timeResolution: 48000,
    sampleRate: 48000,
    channels: 1,
  };
  return {
    asset,
    plan: {
      mode: "motion",
      duration,
      layers: [],
      audio: [
        {
          id: asset.id,
          start: zero,
          end: duration,
          media: {
            assetId: asset.id,
            sourceStart: zero,
            timelineStart: zero,
            timelineEnd: duration,
            mute: false,
            volume: 1,
          },
        },
      ],
    },
  };
}
