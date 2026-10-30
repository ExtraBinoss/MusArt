import { useCallback, useState, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import { useProjectPreference, useProjectPreferences } from "../workspace/preferences/context";
import { clampTimelineHeight, readTimelineHeight, rememberTimelineHeight } from "./height";

interface LocalValue {
  owner: ReturnType<typeof useProjectPreferences>;
  source: number | undefined;
  value: number;
}

export function useTimelineCollapsedRows() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  return { collapsed, setCollapsed, toggle };
}

/** Range navigation keeps its callback stable while native scroll changes the virtual window. */
export function useTimelineRangeZoom({
  zoom,
  width,
  actionWidth,
  protectZoom,
  saveZoom,
  setZoom,
  viewport: viewportRef,
  horizontalScroll: horizontalScrollRef,
  desiredZoom: desiredZoomRef,
  anchor: anchorRef,
}: {
  zoom: number;
  width: number;
  actionWidth: number;
  protectZoom: () => void;
  saveZoom: (value: number) => void;
  setZoom: (value: number) => void;
  viewport: RefObject<HTMLDivElement | null>;
  horizontalScroll: RefObject<number>;
  desiredZoom: RefObject<number>;
  anchor: RefObject<{ time: number; x: number } | null>;
}) {
  return useCallback(
    (start: number, end: number) => {
      const next = Math.min(
        640,
        Math.max(zoom * 2, (width - actionWidth - 48) / Math.max(0.001, end - start)),
      );
      protectZoom();
      saveZoom(next);
      if (next === zoom && viewportRef.current) {
        horizontalScrollRef.current = Math.max(0, start * next - 24);
        viewportRef.current.scrollLeft = horizontalScrollRef.current;
      } else {
        anchorRef.current = { time: start, x: 24 };
        desiredZoomRef.current = next;
        setZoom(next);
      }
    },
    [
      zoom,
      width,
      actionWidth,
      protectZoom,
      saveZoom,
      setZoom,
      viewportRef,
      horizontalScrollRef,
      desiredZoomRef,
      anchorRef,
    ],
  );
}

/** Durable preferences only update this panel; pointer painting and the playback clock stay local. */
export function useTimelinePreferences(engine: EnginePort) {
  const preferences = useProjectPreferences();
  const storedZoom = useProjectPreference("timelineZoom");
  const storedHeight = useProjectPreference("timelineHeight");
  const [localZoom, setLocalZoom] = useState<LocalValue | null>(null);
  const [localHeight, setLocalHeight] = useState<LocalValue | null>(null);
  // A gesture overrides its current source only. Fresh hydration is derived directly,
  // without an effect that copies external state or a stale override from another project.
  const zoom =
    localZoom !== null && localZoom.owner === preferences && localZoom.source === storedZoom
      ? localZoom.value
      : (storedZoom ?? 120);
  const height =
    localHeight !== null && localHeight.owner === preferences && localHeight.source === storedHeight
      ? localHeight.value
      : storedHeight === undefined
        ? readTimelineHeight(engine, window.innerHeight)
        : clampTimelineHeight(storedHeight * window.innerHeight, window.innerHeight);
  const setZoom = useCallback(
    (value: number) => {
      setLocalZoom({ owner: preferences, source: preferences?.read("timelineZoom"), value });
    },
    [preferences],
  );
  const setHeight = useCallback(
    (value: number) => {
      setLocalHeight({ owner: preferences, source: preferences?.read("timelineHeight"), value });
    },
    [preferences],
  );
  const protectZoom = useCallback(() => preferences?.protect("timelineZoom"), [preferences]);
  const protectHeight = useCallback(() => preferences?.protect("timelineHeight"), [preferences]);
  const saveZoom = useCallback(
    (value: number, delay = 0) => {
      preferences?.commit("timelineZoom", value, delay);
    },
    [preferences],
  );
  const saveHeight = useCallback(
    (value: number) => {
      rememberTimelineHeight(engine, value, window.innerHeight);
      preferences?.commit("timelineHeight", value / window.innerHeight);
    },
    [engine, preferences],
  );
  const fitHeight = useCallback(() => {
    const ratio = preferences?.read("timelineHeight");
    setHeight(
      ratio === undefined
        ? readTimelineHeight(engine, window.innerHeight)
        : clampTimelineHeight(ratio * window.innerHeight, window.innerHeight),
    );
  }, [engine, preferences, setHeight]);
  return {
    zoom,
    setZoom,
    height,
    setHeight,
    protectZoom,
    protectHeight,
    saveZoom,
    saveHeight,
    fitHeight,
  };
}
