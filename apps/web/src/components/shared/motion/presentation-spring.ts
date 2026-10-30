import { animate } from "motion/react";

/** Critically damped position response, shared by floating surfaces and viewport reservations. */
export const presentationSpring = {
  type: "spring" as const,
  mass: 1,
  stiffness: 385.53,
  damping: 39.27,
};

export function animatePresentationProgress(update: (progress: number) => void) {
  const animation = animate(0, 1, { ...presentationSpring, onUpdate: update });
  return {
    stop: () => animation.stop(),
    finished: Promise.resolve(animation).then(() => undefined),
  };
}
