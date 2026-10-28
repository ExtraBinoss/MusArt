import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useStore } from "jotai";
import type { SearchItem } from "../../search/catalog/model";
import { dockCommandsAtom, moveDockCommand } from "./preferences";
const MIME = "application/x-musart-dock-command";
interface Origin {
  id: string;
  ids: readonly string[];
  scope: string;
}
/** Reorder a visual copy; the authoritative preference list changes once on a valid final drop. */
export function useDockDrag(ids: readonly string[], commands: readonly SearchItem[]) {
  const store = useStore(),
    scope = JSON.stringify(commands.map((command) => command.id));
  const source = useRef<Origin | null>(null),
    projection = useRef<string[] | null>(null);
  const pointer = useRef<{ x: number; y: number; top: number; left: number } | null>(null);
  const [visual, setVisual] = useState<{ origin: Origin; ids: string[] } | null>(null);
  const cancel = useCallback(() => {
    source.current = null;
    projection.current = null;
    pointer.current = null;
    setVisual(null);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      source.current = null;
      projection.current = null;
      pointer.current = null;
    };
  }, [cancel]);
  useEffect(() => {
    source.current = null;
    projection.current = null;
    pointer.current = null;
  }, [ids, scope]);
  function current(origin: Origin) {
    return (
      origin.ids === ids && origin.ids === store.get(dockCommandsAtom) && origin.scope === scope
    );
  }
  const active = visual?.origin.ids === ids && visual.origin.scope === scope ? visual : null;
  return {
    ids: active?.ids ?? ids,
    dragging: active?.origin.id ?? null,
    cancel,
    start(event: DragEvent<HTMLElement>, id: string) {
      if (
        store.get(dockCommandsAtom) !== ids ||
        !ids.includes(id) ||
        !commands.some((command) => command.id === id)
      ) {
        cancel();
        return;
      }
      const origin = { id, ids, scope };
      source.current = origin;
      projection.current = null;
      pointer.current = null;
      setVisual({ origin, ids: [...ids] });
      event.dataTransfer.setData(MIME, id);
      event.dataTransfer.effectAllowed = "move";
    },
    over(event: DragEvent<HTMLElement>, id: string) {
      const origin = source.current;
      if (!origin) return;
      if (!current(origin)) {
        cancel();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const viewport = event.currentTarget.closest<HTMLElement>("[data-dock-scroll]"),
        top = viewport?.scrollTop ?? 0,
        left = viewport?.scrollLeft ?? 0;
      const x = Number.isFinite(event.clientX) ? event.clientX : 0,
        y = Number.isFinite(event.clientY) ? event.clientY : 0;
      if (
        pointer.current &&
        pointer.current.x === x &&
        pointer.current.y === y &&
        pointer.current.top === top &&
        pointer.current.left === left
      )
        return;
      if (id === origin.id) return;
      pointer.current = { x, y, top, left };
      const bounds = event.currentTarget.getBoundingClientRect(),
        after = y >= bounds.top + bounds.height / 2;
      const target = ids.filter((value) => value !== origin.id).indexOf(id);
      if (target < 0) return;
      const next = moveDockCommand(ids, origin.id, target + (after ? 1 : 0));
      if (projection.current?.every((value, index) => value === next[index])) return;
      projection.current = next;
      setVisual({ origin, ids: next });
    },
    overViewport(this: void, event: DragEvent<HTMLElement>) {
      if (source.current && current(source.current) && projection.current) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    },
    drop(event: DragEvent<HTMLElement>): boolean {
      event.preventDefault();
      event.stopPropagation();
      const origin = source.current,
        next = projection.current;
      const changed =
        !!origin &&
        current(origin) &&
        event.dataTransfer.getData(MIME) === origin.id &&
        !!next &&
        next.some((id, at) => id !== ids[at]);
      cancel();
      if (changed) store.set(dockCommandsAtom, next);
      return changed;
    },
  };
}
