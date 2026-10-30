import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { CollapsibleContent } from "../../ui/collapsible";

/** Retarget from the current height on reversals, retaining controls only through their exit. */
export function AnimatedCollapsibleContent({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <Panel key="content" reduced={reduced} className={className}>
          {children}
        </Panel>
      )}
    </AnimatePresence>
  );
}
function Panel({
  children,
  reduced,
  className,
}: {
  children: ReactNode;
  reduced: boolean;
  className?: string;
}) {
  const present = useIsPresent();
  return (
    <CollapsibleContent forceMount asChild>
      <motion.div
        className={className}
        inert={!present}
        aria-hidden={!present}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{
          height: { duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: reduced ? 0 : present ? 0.16 : 0.1 },
        }}
      >
        {children}
      </motion.div>
    </CollapsibleContent>
  );
}
