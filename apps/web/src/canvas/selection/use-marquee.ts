import { useMemo, type RefObject } from "react";
import type { Point } from "../viewport/view";

/** A retained selection box paints pointer updates without publishing React or GPU frames. */
export function useMarquee(ref: RefObject<HTMLDivElement | null>) {
  return useMemo(
    () => ({
      show(from: Point, to: Point) {
        const element = ref.current;
        if (!element) return;
        element.hidden = false;
        Object.assign(element.style, {
          left: `${Math.min(from.x, to.x)}px`,
          top: `${Math.min(from.y, to.y)}px`,
          width: `${Math.abs(to.x - from.x)}px`,
          height: `${Math.abs(to.y - from.y)}px`,
        });
      },
      clear() {
        if (ref.current) ref.current.hidden = true;
      },
    }),
    [ref],
  );
}
