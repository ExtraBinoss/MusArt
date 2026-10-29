import { useLayoutEffect, useRef, type RefObject } from "react";
import { animate } from "motion/mini";
import { spring } from "motion";

/** Ordinary scrolling writes plain DOM styles; only an explicit held drag animates positions. */
export function useRowPosition(
  nodeRef: RefObject<HTMLElement | null>,
  owner: string,
  top: number,
  moving: boolean,
  reduced: boolean,
) {
  const previous = useRef({ owner, top });
  const carry = useRef(0);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { owner, top };
    const row = nodeRef.current;
    if (!row) return;
    if (
      !moving ||
      reduced ||
      before.owner !== owner ||
      before.top === top ||
      typeof Element.prototype.animate !== "function"
    ) {
      row.style.transform = "";
      carry.current = 0;
      return;
    }
    const from = before.top + carry.current - top;
    carry.current = 0;
    const animation = animate(
      row,
      { transform: [`translateY(${from}px)`, "translateY(0px)"] },
      { type: spring, stiffness: 430, damping: 34, mass: 0.65 },
    );
    return () => {
      const transform = getComputedStyle(row).transform;
      carry.current = transform && transform !== "none" ? new DOMMatrixReadOnly(transform).m42 : 0;
      animation.stop();
      row.style.transform = "";
    };
  }, [nodeRef, owner, top, moving, reduced]);
}
