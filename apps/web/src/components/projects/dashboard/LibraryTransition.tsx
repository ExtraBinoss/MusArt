import type { ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";

/** Outgoing content becomes inert immediately; its short exit never admits stale clicks. */
export function LibraryTransition({ children }: { children: ReactNode }) {
  const present = useIsPresent(),
    reduced = useReducedMotion();
  return (
    <motion.div
      className="dashboard-list-content"
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      style={present ? undefined : { position: "absolute", top: 0, left: 0, right: 0 }}
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
