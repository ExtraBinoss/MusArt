import { useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode, type Ref } from "react";
import {
  LayoutGroup,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Button } from "../../ui/button";
import "./mobile-navigation.css";

export interface MobileNavigationItem {
  value: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  badge?: string;
  popup?: "dialog";
  expanded?: boolean;
}
/** Shared touch navigation. Motion owns presentation; selection changes only on activation. */
export function MobileNavigation({
  label,
  value,
  items,
  disabled = false,
  selection = "current",
  className = "",
  position,
  navRef,
  onSelect,
}: {
  label: string;
  value: string | null;
  items: readonly MobileNavigationItem[];
  disabled?: boolean;
  selection?: "current" | "expanded";
  className?: string;
  position?: MotionValue<number>;
  navRef?: Ref<HTMLElement>;
  onSelect: (value: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const id = useId(),
    reduced = useReducedMotion(),
    fallback = useMotionValue(NaN);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selected = items.findIndex((item) => item.value === value),
    stride = useMotionValue(0);
  useLayoutEffect(() => {
    const first = buttons.current.get(items[0]?.value ?? ""),
      next = buttons.current.get(items[1]?.value ?? "");
    if (!first || !next) return;
    const measure = () => stride.set(next.offsetLeft - first.offsetLeft);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(first.parentElement!);
    return () => observer.disconnect();
  }, [items, stride]);
  const offset = useTransform(() => {
    const index = (position ?? fallback).get();
    return Number.isFinite(index) ? (index - selected) * stride.get() : 0;
  });
  return (
    <LayoutGroup id={id}>
      <nav
        ref={navRef}
        className={`mobile-bottom-nav ${className}`}
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        data-canvas-control
        onKeyDown={(event) => {
          const index = items.findIndex((item) => buttons.current.get(item.value) === event.target);
          if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const enabled = items.filter((item) => !disabled && !item.disabled);
          const current = enabled.findIndex((item) => item.value === items[index]!.value);
          const step = event.key === "ArrowLeft" ? -1 : 1;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? enabled.length - 1
                : (current + step + enabled.length) % enabled.length;
          const target = enabled[next];
          if (target) {
            event.preventDefault();
            buttons.current.get(target.value)?.focus();
          }
        }}
      >
        {items.map((item) => (
          <Button
            key={item.value}
            ref={(node) => {
              if (node) buttons.current.set(item.value, node);
              else buttons.current.delete(item.value);
            }}
            type="button"
            variant="ghost"
            className="mobile-nav-item"
            disabled={disabled || item.disabled}
            data-navigation-value={item.value}
            aria-label={item.badge ? `${item.label} · ${item.badge}` : item.label}
            aria-current={
              !item.popup && selection === "current" && value === item.value ? "page" : undefined
            }
            aria-haspopup={item.popup}
            aria-expanded={
              item.popup
                ? item.expanded
                : selection === "expanded"
                  ? value === item.value
                  : undefined
            }
            onClick={(event) => onSelect(item.value, event)}
          >
            {value === item.value && (
              <motion.span
                aria-hidden
                className="mobile-nav-indicator"
                layoutId="mobile-nav-selection"
                initial={false}
                style={{ x: offset }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 460, damping: 38, mass: 0.7 }
                }
              />
            )}
            <span className="mobile-nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="mobile-nav-label">
              {item.label}
              {item.badge && <small>{item.badge}</small>}
            </span>
          </Button>
        ))}
      </nav>
    </LayoutGroup>
  );
}
