import { useLayoutEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { cn } from "../../ui/utils";
import "./scroll-shadow.css";
/** Decorates one existing scroll viewport without replacing its ref, events or accessible role. */
export function ScrollShadow({
  children,
  className,
  style,
}: {
  children: ReactElement;
  className?: string;
  style?: CSSProperties;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = root.current,
      viewport = wrapper?.firstElementChild;
    if (!(viewport instanceof HTMLElement) || !wrapper) return;
    function measure() {
      if (!wrapper || !(viewport instanceof HTMLElement)) return;
      wrapper.toggleAttribute("data-overflow-top", viewport.scrollTop > 1);
      wrapper.toggleAttribute(
        "data-overflow-bottom",
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 1,
      );
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
    viewport.addEventListener("scroll", measure, { passive: true });
    observeChildren();
    return () => {
      viewport.removeEventListener("scroll", measure);
      resize.disconnect();
      childrenObserver.disconnect();
    };
  }, [children.type, children.key]);
  return (
    <div className={cn("scroll-shadow", className)} ref={root} style={style}>
      {children}
    </div>
  );
}
