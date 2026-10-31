import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { FolderOpen, LayoutTemplate, Settings2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MobileNavigation } from "../../shared/navigation/MobileNavigation";
import { bindSectionSwipe } from "../../shared/navigation/section-swipe";
import "./library-messages";
import "./mobile-library.css";

export function MobileLibraryNavigation({
  view,
  busy,
  preferences,
  surface,
  content,
  onViewChange,
  onPreferences,
}: {
  view: "projects" | "templates";
  busy: boolean;
  preferences: boolean;
  surface: RefObject<HTMLElement | null>;
  content: RefObject<HTMLDivElement | null>;
  onViewChange: (view: "projects" | "templates") => void;
  onPreferences: () => void;
}) {
  const { t } = useTranslation("library"),
    reduced = useReducedMotion();
  const nav = useRef<HTMLElement>(null),
    position = useMotionValue(NaN),
    x = useMotionValue(0);
  const latest = useRef({ view, busy, preferences, choose });
  const cancel = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    latest.current = { view, busy, preferences, choose };
  });
  function choose(value: string) {
    if ((value !== "projects" && value !== "templates") || busy || preferences) return;
    // Do not retain focus in an exiting, inert card or interrupt the search input.
    if (content.current?.contains(document.activeElement))
      nav.current
        ?.querySelector<HTMLButtonElement>(`[data-navigation-value="${value}"]`)
        ?.focus({ preventScroll: true });
    onViewChange(value);
  }
  useEffect(() => {
    const target = surface.current,
      stage = content.current;
    if (!target || !stage) return;
    let spring: ReturnType<typeof animate> | undefined;
    const unsubscribe = x.on("change", (value) => {
      stage.style.transform = value ? `translate3d(${value}px, 0, 0)` : "";
    });
    const binding = bindSectionSwipe(target, {
      read: () => ({
        value: latest.current.view,
        values: ["templates", "projects"],
        disabled: latest.current.busy || latest.current.preferences,
      }),
      move: (offset, index) => {
        spring?.stop();
        x.set(offset * 0.35);
        position.set(index);
      },
      rest: () => {
        position.set(NaN);
        spring?.stop();
        if (reduced) x.set(0);
        else spring = animate(x, 0, { type: "spring", stiffness: 460, damping: 38 });
      },
      select: (value) => latest.current.choose(value),
    });
    cancel.current = binding.cancel;
    return () => {
      cancel.current = null;
      binding.dispose();
      spring?.stop();
      unsubscribe();
      stage.style.transform = "";
    };
  }, [surface, content, reduced, position, x]);
  useLayoutEffect(() => {
    cancel.current?.();
  }, [view, busy, preferences]);
  return (
    <MobileNavigation
      navRef={nav}
      className="mobile-library-nav"
      label={t("navigation")}
      value={preferences ? "preferences" : view}
      position={position}
      disabled={busy}
      onSelect={(value) => {
        if (busy) return;
        if (value === "projects" || value === "templates") choose(value);
        else if (value === "preferences") onPreferences();
      }}
      items={[
        {
          value: "templates",
          label: t("templates"),
          icon: <LayoutTemplate size={20} strokeWidth={1.6} />,
        },
        {
          value: "projects",
          label: t("projects"),
          icon: <FolderOpen size={20} strokeWidth={1.6} />,
        },
        {
          value: "community",
          label: t("community"),
          badge: t("soon"),
          icon: <Users size={20} strokeWidth={1.6} />,
          disabled: true,
        },
        {
          value: "preferences",
          label: t("preferences"),
          popup: "dialog",
          expanded: preferences,
          icon: <Settings2 size={20} strokeWidth={1.6} />,
        },
      ]}
    />
  );
}
