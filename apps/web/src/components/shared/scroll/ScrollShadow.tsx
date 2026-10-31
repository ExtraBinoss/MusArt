import { useLayoutEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { cn } from "../../ui/utils";
import "./scroll-shadow.css";
/** Decorates one existing scroll viewport without replacing its ref, events or accessible role. */
export function ScrollShadow({
  children,
  className,
  style,
  surface,
  viewportSelector,
  axis = "vertical",
  fade = "surface",
}: {
  children: ReactElement;
  className?: string;
  style?: CSSProperties;
  /** CSS color or theme token. An omitted value inherits --scroll-shadow-surface. */
  surface?: string;
  /** Locate a viewport inside a component that emits sibling metadata (for example Radix Select). */
  viewportSelector?: string;
  axis?: "vertical" | "horizontal" | "both";
  /** Fade content itself on translucent/blurred panels, without painting an opaque surface. */
  fade?: "surface" | "mask";
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = root.current;
    if (!wrapper) return;
    for (const side of ["top", "bottom", "left", "right"])
      wrapper.removeAttribute(`data-overflow-${side}`);
    const viewport = viewportSelector
      ? wrapper.querySelector(viewportSelector)
      : wrapper.firstElementChild;
    if (!(viewport instanceof HTMLElement)) return;
    let maximumTop = 0,
      maximumLeft = 0,
      bottomGutter = -1,
      rightGutter = -1,
      active = true;
    function paint() {
      if (!active || !wrapper || !(viewport instanceof HTMLElement)) return;
      const top = viewport.scrollTop,
        left = viewport.scrollLeft;
      wrapper.toggleAttribute("data-overflow-top", axis !== "horizontal" && top > 1);
      wrapper.toggleAttribute(
        "data-overflow-bottom",
        axis !== "horizontal" && maximumTop - top > 1,
      );
      wrapper.toggleAttribute("data-overflow-left", axis !== "vertical" && left > 1);
      wrapper.toggleAttribute("data-overflow-right", axis !== "vertical" && maximumLeft - left > 1);
    }
    function measure() {
      if (!active || !wrapper || !(viewport instanceof HTMLElement)) return;
      const height = viewport.clientHeight,
        width = viewport.clientWidth,
        scrollWidth = viewport.scrollWidth;
      maximumTop = Math.max(0, viewport.scrollHeight - height);
      maximumLeft = Math.max(0, scrollWidth - width);
      // Overlay scrollbars occupy no layout gutter. Keep the shared six-pixel bar clear too.
      const bottom = Math.max(viewport.offsetHeight - height, maximumLeft > 1 ? 6 : 0),
        right = Math.max(viewport.offsetWidth - width, maximumTop > 1 ? 6 : 0);
      if (bottom !== bottomGutter) {
        bottomGutter = bottom;
        wrapper.style.setProperty("--scroll-shadow-scrollbar-bottom", `${bottom}px`);
      }
      if (right !== rightGutter) {
        rightGutter = right;
        wrapper.style.setProperty("--scroll-shadow-scrollbar-right", `${right}px`);
      }
      paint();
    }
    const resize = new ResizeObserver(measure);
    function observeChildren() {
      if (!active) return;
      resize.disconnect();
      resize.observe(viewport as HTMLElement);
      for (const child of viewport!.children) resize.observe(child);
      // ResizeObserver delivers the initial/new-child sizes after layout. Avoid
      // forcing a synchronous layout from the mutation microtask itself.
    }
    const childrenObserver = new MutationObserver(observeChildren);
    childrenObserver.observe(viewport, { childList: true });
    viewport.addEventListener("scroll", paint, { passive: true });
    observeChildren();
    return () => {
      active = false;
      viewport.removeEventListener("scroll", paint);
      resize.disconnect();
      childrenObserver.disconnect();
    };
  }, [children.type, children.key, viewportSelector, axis]);
  return (
    <div
      className={cn("scroll-shadow", className)}
      ref={root}
      data-scroll-shadow-axis={axis}
      data-scroll-shadow-fade={fade}
      data-scroll-axis={axis}
      style={surface ? ({ ...style, "--scroll-shadow-surface": surface } as CSSProperties) : style}
    >
      {children}
      {axis !== "vertical" && (
        <>
          <span className="scroll-shadow-inline-start scroll-shadow-side" aria-hidden="true" />
          <span className="scroll-shadow-inline-end scroll-shadow-side" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
