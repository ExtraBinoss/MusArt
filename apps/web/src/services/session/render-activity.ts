import type { EnginePort } from "@musart/core";
import { effectPreviewActivity } from "../../state/session/effect-preview";
import { createMotionTransport } from "../motion/transport";

/** Optional GPU work observes playback transitions, never emits one notification per frame. */
export function createRenderActivity(engine: EnginePort) {
  const effects = effectPreviewActivity(engine);
  const motion = createMotionTransport(engine);
  return {
    busy: () => effects.busy() || motion.read().playing,
    subscribe(listener: () => void): () => void {
      let playing = motion.read().playing;
      const stopEffects = effects.subscribe(listener);
      const stopMotion = motion.subscribe(() => {
        const next = motion.read().playing;
        if (next === playing) return;
        playing = next;
        listener();
      });
      return () => {
        stopEffects();
        stopMotion();
      };
    },
  };
}
