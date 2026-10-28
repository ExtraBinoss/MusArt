import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence, motion, useIsPresent } from "motion/react";

const Content = motion.create(DialogPrimitive.Content);
const Overlay = motion.create(DialogPrimitive.Overlay);
type ContentProps = ComponentProps<typeof Content>;
interface Props extends ContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reduced: boolean;
}
/** Radix retains focus/modal semantics while Motion owns only the palette's visual presence. */
export function SearchDialog({ open, onOpenChange, reduced, ...props }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && <SearchDialogLayers key="palette" reduced={reduced} {...props} />}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
function SearchDialogLayers({ reduced, children, ...props }: ContentProps & { reduced: boolean }) {
  const present = useIsPresent();
  const transition = {
    duration: reduced ? 0 : present ? 0.16 : 0.1,
    ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  };
  return (
    <DialogPrimitive.Portal forceMount>
      <Overlay
        forceMount
        data-slot="dialog-overlay"
        className="magic-search-overlay"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        style={{ pointerEvents: present ? "auto" : "none" }}
      />
      <Content
        {...props}
        forceMount
        data-slot="dialog-content"
        data-magic-search
        inert={!present || undefined}
        aria-hidden={!present || undefined}
        initial={reduced ? false : { opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.99 }}
        transition={transition}
        style={{ ...props.style, pointerEvents: present ? "auto" : "none" }}
      >
        {children}
      </Content>
    </DialogPrimitive.Portal>
  );
}
