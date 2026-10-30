import { useLayoutEffect, type RefObject } from "react";
/** Opt-in commit counters for headless verification; no public global API or per-frame loop. */
export function useRenderMetrics(element: RefObject<Element | null>) {
  useLayoutEffect(() => {
    if (new URLSearchParams(location.search).get("automation") !== "1") return;
    const node = element.current;
    if (node)
      node.setAttribute(
        "data-react-renders",
        String(Number(node.getAttribute("data-react-renders") ?? 0) + 1),
      );
  });
}
