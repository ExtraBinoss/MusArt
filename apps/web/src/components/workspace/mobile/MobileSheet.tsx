import { useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { motion, useDragControls, useReducedMotion, useIsPresent } from "motion/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PanelHeaderTarget } from "../../shared/panels/PanelHeaderActions";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { Button } from "../../ui/button";
import "./messages";

/** Non-modal Radix surface: the canvas remains available above the sheet. */
export function MobileSheet({
  title,
  onClose,
  children,
  focusOnOpen = true,
  dismissible = true,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  focusOnOpen?: boolean;
  dismissible?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("mobile");
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const surface = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const present = useIsPresent();
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);
  function releaseHandle() {
    handle.current?.removeAttribute("data-active");
  }
  return (
    <PanelHeaderTarget value={headerTarget}>
      <DialogPrimitive.Root
        open
        modal={false}
        onOpenChange={(open) => {
          if (!open && dismissible && present) onClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            asChild
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              if (focusOnOpen) surface.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
            aria-hidden={!present || undefined}
            inert={!present || undefined}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              // Radix sees document-capture Escape before the field's React handler.
              // Keep the sheet mounted long enough for that handler to cancel its draft.
              if (!dismissible || surface.current?.querySelector("[data-mobile-adjusting]"))
                event.preventDefault();
            }}
          >
            <motion.section
              ref={surface}
              className={`mobile-sheet ${className}`}
              data-canvas-control
              data-keybinding-capture
              initial={reduced ? false : { y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: reduced ? 0 : 60, opacity: 0 }}
              style={{ pointerEvents: present ? "auto" : "none" }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              drag={dismissible ? "y" : false}
              dragListener={false}
              dragControls={controls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => {
                releaseHandle();
                if (dismissible && (info.offset.y > 65 || info.velocity.y > 650)) onClose();
              }}
            >
              <header className="mobile-sheet-header">
                <button
                  ref={handle}
                  type="button"
                  disabled={!dismissible}
                  className="mobile-sheet-handle"
                  aria-label={t("dismiss")}
                  onPointerDown={(event) => {
                    if (!dismissible || event.button !== 0) return;
                    event.currentTarget.dataset.active = "true";
                    controls.start(event);
                  }}
                  onPointerUp={releaseHandle}
                  onPointerCancel={releaseHandle}
                  onLostPointerCapture={releaseHandle}
                  onKeyDown={(event) => {
                    if (dismissible && event.key === "ArrowDown") onClose();
                  }}
                >
                  <span />
                </button>
                <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
                <div ref={setHeaderTarget} className="mobile-sheet-heading-actions" />
                <DialogPrimitive.Description className="sr-only">
                  {t("dismiss")}
                </DialogPrimitive.Description>
                <Button
                  variant="ghost"
                  className="mobile-sheet-close"
                  aria-label={t("close")}
                  disabled={!dismissible}
                  onClick={onClose}
                >
                  <X size={17} />
                </Button>
              </header>
              <ScrollShadow className="mobile-sheet-scroll" surface="var(--background)">
                <div className="mobile-sheet-content">{children}</div>
              </ScrollShadow>
            </motion.section>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PanelHeaderTarget>
  );
}
