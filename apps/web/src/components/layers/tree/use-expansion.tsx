import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { animate, type AnimationPlaybackControls } from "motion";
import type { PositionedLayerEntry } from "../drag/window";
import { LAYER_ROW_HEIGHT } from "./use-virtual-rows";
import { expansionWindow } from "./expansion-window";

interface Entry {
  key: string;
  kind: string;
}
interface Snapshot<T extends Entry> {
  rows: PositionedLayerEntry<T>[];
  scope: object;
  positions: Map<string, number>;
  height: number;
  anchor: number;
}
function treeWindow(viewport: RefObject<HTMLDivElement | null>) {
  return viewport.current?.querySelector<HTMLElement>(".layer-tree-window");
}
/** Explicit chevron gestures animate one retained virtual window; ordinary scrolling stays immediate. */
export function useExpansion<T extends Entry>(
  visible: PositionedLayerEntry<T>[],
  entries: readonly T[],
  height: number,
  scope: object,
  viewport: RefObject<HTMLDivElement | null>,
  disabled: boolean,
) {
  const enabled = !disabled && typeof Element.prototype.animate === "function";
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  if (snapshot && (!enabled || snapshot.scope !== scope)) setSnapshot(null);
  const usable = enabled && snapshot?.scope === scope ? snapshot : null;
  const items = useMemo(
    () => (usable ? expansionWindow(visible, usable.rows, entries) : visible),
    [visible, usable, entries],
  );
  const latest = useRef({ rows: items, height, scope });
  const stop = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    stop.current?.();
    stop.current = null;
    setSnapshot(null);
  }, []);
  useLayoutEffect(() => {
    latest.current = { rows: items, height, scope };
  }, [items, height, scope]);
  const begin = useCallback(
    (key: string) => {
      if (!enabled) return;
      const window = treeWindow(viewport);
      if (!window) return;
      const origin = window.getBoundingClientRect().top,
        positions = new Map<string, number>();
      for (const row of window.querySelectorAll<HTMLElement>("[data-layer-tree-key]"))
        positions.set(row.dataset.layerTreeKey!, row.getBoundingClientRect().top - origin);
      const current = latest.current;
      const previous = {
        rows: current.rows,
        scope: current.scope,
        positions,
        height: window.getBoundingClientRect().height || current.height,
        anchor: positions.get(key) ?? 0,
      };
      stop.current?.();
      stop.current = null;
      setSnapshot(previous);
    },
    [enabled, viewport],
  );
  useLayoutEffect(() => {
    const window = treeWindow(viewport);
    if (!window) return;
    // An old animation cleanup can run after React writes a replacement document's height.
    const canonicalHeight = `${height}px`;
    if (window.style.height !== canonicalHeight) window.style.height = canonicalHeight;
    if (!usable) return;
    const canonical = new Set(entries.map((entry) => entry.key)),
      byKey = new Map(items.map((item) => [item.entry.key, item]));
    const controls: AnimationPlaybackControls[] = [],
      restores: (() => void)[] = [];
    let live = true;
    const cleanup = () => {
      if (!live) return;
      live = false;
      for (const control of controls) control.stop();
      for (const restore of restores) restore();
      delete window.dataset.expanding;
    };
    stop.current = cleanup;
    const transition = {
      duration: 0.16,
      ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
    };
    for (const row of window.querySelectorAll<HTMLElement>("[data-layer-tree-key]")) {
      const key = row.dataset.layerTreeKey!,
        item = byKey.get(key);
      if (!item) continue;
      const exiting = !canonical.has(key),
        previous = usable.positions.get(key),
        top = item.at * LAYER_ROW_HEIGHT,
        from = (previous ?? usable.anchor + LAYER_ROW_HEIGHT) - top,
        to = exiting ? usable.anchor + LAYER_ROW_HEIGHT - top : 0;
      const saved = {
        transform: row.style.transform,
        opacity: row.style.opacity,
        height: row.style.height,
        overflow: row.style.overflow,
        hidden: row.getAttribute("aria-hidden"),
        inert: row.hasAttribute("inert"),
      };
      restores.push(() => {
        Object.assign(row.style, {
          transform: saved.transform,
          opacity: saved.opacity,
          height: saved.height,
          overflow: saved.overflow,
        });
        if (saved.hidden === null) row.removeAttribute("aria-hidden");
        else row.setAttribute("aria-hidden", saved.hidden);
        if (!saved.inert) row.removeAttribute("inert");
        delete row.dataset.expansionExit;
      });
      if (exiting) {
        row.setAttribute("inert", "");
        row.setAttribute("aria-hidden", "true");
        row.dataset.expansionExit = "true";
      }
      if (from === to && !exiting && previous !== undefined) continue;
      row.style.overflow = "hidden";
      controls.push(
        animate(
          row,
          {
            transform: [`translateY(${from}px)`, `translateY(${to}px)`],
            opacity: [previous === undefined ? 0 : 1, exiting ? 0 : 1],
            height: [previous === undefined ? 0 : LAYER_ROW_HEIGHT, exiting ? 0 : LAYER_ROW_HEIGHT],
          },
          transition,
        ),
      );
    }
    const finalHeight = window.style.height;
    restores.push(() => {
      window.style.height = finalHeight;
    });
    window.dataset.expanding = "true";
    controls.push(
      animate(
        window,
        { height: [usable.height, height] },
        {
          ...transition,
          onComplete: () => {
            if (live) setSnapshot((current) => (current === usable ? null : current));
          },
        },
      ),
    );
    return () => {
      cleanup();
      if (stop.current === cleanup) stop.current = null;
    };
  }, [usable, items, entries, height, viewport]);
  return { items, begin, cancel };
}
