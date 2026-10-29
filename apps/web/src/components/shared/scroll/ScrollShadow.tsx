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
}: {
  children: ReactElement;
  className?: string;
  style?: CSSProperties;
  /** CSS color or theme token. An omitted value inherits --scroll-shadow-surface. */
  surface?: string;
  /** Locate a viewport inside a component that emits sibling metadata (for example Radix Select). */
  viewportSelector?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = root.current,
      viewport = viewportSelector
        ? wrapper?.querySelector(viewportSelector)
        : wrapper?.firstElementChild;
    if (!(viewport instanceof HTMLElement) || !wrapper) return;
    let maximumTop = 0,
      bottomGutter = -1,
      rightGutter = -1;
    function paint() {
      if (!wrapper || !(viewport instanceof HTMLElement)) return;
      const top = viewport.scrollTop;
      wrapper.toggleAttribute("data-overflow-top", top > 1);
      wrapper.toggleAttribute("data-overflow-bottom", maximumTop - top > 1);
    }
    function measure() {
      if (!wrapper || !(viewport instanceof HTMLElement)) return;
      const height = viewport.clientHeight,
        width = viewport.clientWidth;
      maximumTop = Math.max(0, viewport.scrollHeight - height);
      // Overlay scrollbars occupy no layout gutter. Keep the shared six-pixel bar clear too.
      const bottom = Math.max(
          viewport.offsetHeight - height,
          viewport.scrollWidth > width + 1 ? 6 : 0,
        ),
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
      viewport.removeEventListener("scroll", paint);
      resize.disconnect();
      childrenObserver.disconnect();
    };
  }, [children.type, children.key, viewportSelector]);
  return (
    <div
      className={cn("scroll-shadow", className)}
      ref={root}
      style={surface ? ({ ...style, "--scroll-shadow-surface": surface } as CSSProperties) : style}
    >
      {children}
    </div>
  );
}
