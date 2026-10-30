import { assertNumber, assertRecord } from "../../document/guards";
import { ensure } from "../../errors";
import { compareMotionTime, validateMotionTime, type MotionTime } from "../time";
import type { MotionAudioProcessing } from "./model";
export const DEFAULT_AUDIO_PROCESSING: Readonly<MotionAudioProcessing> = Object.freeze({
  fadeIn: Object.freeze({ value: 0, rate: 1 }),
  fadeOut: Object.freeze({ value: 0, rate: 1 }),
  reverb: Object.freeze({ mix: 0, decay: 0.8 }),
});

export function validateMotionAudioProcessing(value: unknown, duration: MotionTime): void {
  if (value === undefined) return;
  assertRecord(value);
  ensure(
    Object.keys(value).every((key) => ["fadeIn", "fadeOut", "reverb"].includes(key)),
    "INVALID_DOCUMENT",
    "Unknown audio processing parameter",
  );
  for (const fade of [value.fadeIn, value.fadeOut]) {
    validateMotionTime(fade);
    ensure(
      fade.value >= 0 && compareMotionTime(fade, duration) <= 0,
      "INVALID_DOCUMENT",
      "Audio fades must fit inside their clip",
    );
  }
  assertRecord(value.reverb);
  ensure(
    Object.keys(value.reverb).every((key) => ["mix", "decay"].includes(key)),
    "INVALID_DOCUMENT",
    "Unknown reverb parameter",
  );
  assertNumber(value.reverb.mix, 0, 1);
  assertNumber(value.reverb.decay, 0.1, 3);
}

/** Missing processing preserves legacy audio exactly. No implicit or hidden room effect. */
export function resolveMotionAudioProcessing(
  processing?: MotionAudioProcessing,
): Readonly<MotionAudioProcessing> {
  return processing ?? DEFAULT_AUDIO_PROCESSING;
}
