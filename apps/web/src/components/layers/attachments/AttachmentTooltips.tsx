import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";

/** One delegated Radix tooltip serves every virtualized attachment without per-row tooltip trees. */
export function AttachmentTooltips({ host }: { host: RefObject<HTMLElement | null> }) {
  const id = useId();
  const [content, setContent] = useState<{
    label: string;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const retire = useRef(() => {});
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let target: HTMLElement | null = null,
      timer: ReturnType<typeof setTimeout> | null = null;
    let previousDescription: string | null = null;
    function close() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (target) {
        if (previousDescription === null) target.removeAttribute("aria-describedby");
        else target.setAttribute("aria-describedby", previousDescription);
      }
      target = null;
      setContent(null);
    }
    retire.current = close;
    const find = (value: EventTarget | null) =>
      value instanceof HTMLElement ? value.closest<HTMLElement>("[data-attachment-tooltip]") : null;
    function enter(event: Event) {
      const next = find(event.target);
      if (!next || !node!.contains(next) || next === target) return;
      close();
      target = next;
      previousDescription = next.getAttribute("aria-describedby");
      timer = setTimeout(
        () => {
          timer = null;
          if (target !== next || !next.isConnected) return;
          const bounds = next.getBoundingClientRect();
          next.setAttribute(
            "aria-describedby",
            [previousDescription, id].filter(Boolean).join(" "),
          );
          setContent({
            label: next.dataset.attachmentTooltip!,
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
          });
        },
        event.type === "focusin" ? 0 : 220,
      );
    }
    function leave(event: Event) {
      const related = (event as PointerEvent | FocusEvent).relatedTarget;
      if (target && find(related) === target) return;
      close();
    }
    node.addEventListener("pointerover", enter);
    node.addEventListener("focusin", enter);
    node.addEventListener("pointerout", leave);
    node.addEventListener("focusout", leave);
    for (const name of ["pointerdown", "keydown", "scroll", "dragstart"] as const)
      node.addEventListener(name, close, true);
    window.addEventListener("resize", close);
    return () => {
      close();
      retire.current = () => {};
      node.removeEventListener("pointerover", enter);
      node.removeEventListener("focusin", enter);
      node.removeEventListener("pointerout", leave);
      node.removeEventListener("focusout", leave);
      for (const name of ["pointerdown", "keydown", "scroll", "dragstart"] as const)
        node.removeEventListener(name, close, true);
      window.removeEventListener("resize", close);
    };
  }, [host, id]);
  if (!content) return null;
  return (
    <Tooltip
      open
      onOpenChange={(open) => {
        if (!open) retire.current();
      }}
    >
      {createPortal(
        <TooltipTrigger asChild>
          <span
            aria-hidden="true"
            style={{
              position: "fixed",
              left: content.left,
              top: content.top,
              width: content.width,
              height: content.height,
              pointerEvents: "none",
            }}
          />
        </TooltipTrigger>,
        document.body,
      )}
      <TooltipContent id={id} side="left" collisionPadding={8}>
        {content.label}
      </TooltipContent>
    </Tooltip>
  );
}
