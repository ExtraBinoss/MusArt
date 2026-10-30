import { useEffect } from "react";
import { atom, useAtomValue } from "jotai";

export type Theme = "system" | "light" | "dark";
const initialized = new WeakSet<HTMLElement>();
let revision = 0;
let active: { root: HTMLElement; dark: boolean; transition: ViewTransition } | null = null;

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("musart.theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}
export const themeAtom = atom<Theme>(readTheme());

function paint(root: HTMLElement, dark: boolean) {
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Native snapshots blend the complete interface, including portals, without a React frame loop. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  try {
    localStorage.setItem("musart.theme", theme);
  } catch {
    /* Theme changes remain available with blocked storage. */
  }
  if (active?.root === root && active.dark === dark) return;
  const request = ++revision;
  active?.transition.skipTransition();
  active = null;
  const first = !initialized.has(root);
  initialized.add(root);
  if (
    first ||
    root.classList.contains("dark") === dark ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !document.startViewTransition
  ) {
    paint(root, dark);
    return;
  }
  try {
    const transition = document.startViewTransition(() => {
      if (request === revision) paint(root, dark);
    });
    active = { root, dark, transition };
    void transition.finished
      .catch(() => undefined)
      .then(() => {
        if (active?.transition === transition) active = null;
      });
  } catch {
    paint(root, dark);
  }
}

export function disposeThemeTransition() {
  ++revision;
  initialized.delete(document.documentElement);
  if (active) {
    paint(active.root, active.dark);
    active.transition.skipTransition();
    active = null;
  }
}

export function useTheme() {
  const theme = useAtomValue(themeAtom);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
  useEffect(() => disposeThemeTransition, []);
}
