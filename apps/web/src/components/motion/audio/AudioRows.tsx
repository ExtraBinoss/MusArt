import { useCallback, useEffect, useMemo, useState } from "react";
import { isAudioAsset, type Asset, type EnginePort, type MotionAudioTrack } from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "../model";
import { createAudioTrackGestures } from "./gestures";
import { AudioRowView } from "./AudioRowView";
import "./messages";
import "./audio.css";

export function AudioRows({
  engine,
  tracks,
  assets,
  transport,
  first,
  last,
  offset,
  rowHeight,
  scale,
  duration,
  left,
  width,
  active,
  unit = "ms",
  visualSelected,
  onError,
}: {
  engine: EnginePort;
  tracks: readonly MotionAudioTrack[];
  assets: Record<string, Asset>;
  transport: TimelineTransport;
  first: number;
  last: number;
  offset: number;
  rowHeight: number;
  scale: number;
  duration: number;
  left: number;
  width: number;
  active: boolean;
  unit?: TimelineUnit;
  visualSelected: boolean;
  onError: (error: unknown) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (selected && (visualSelected || !tracks.some((track) => track.id === selected)))
    setSelected(null);
  const gestures = useMemo(
    () => createAudioTrackGestures(engine, transport, onError),
    [engine, transport, onError],
  );
  useEffect(() => () => gestures.cancel(), [gestures]);
  useEffect(() => {
    if (!active) gestures.cancel();
  }, [active, gestures]);
  const { project, pageId } = engine.getSnapshot();
  const select = useCallback(
    (id: string) => {
      setSelected(id);
      if (engine.getSnapshot().selection.length) engine.select([]);
    },
    [engine],
  );
  return tracks
    .slice(Math.max(0, first - offset), Math.max(0, last - offset))
    .map((track, index) => {
      const asset = assets[track.assetId];
      if (!asset || !isAudioAsset(asset)) return null;
      const at = Math.max(offset, first) + index;
      return (
        <AudioRowView
          key={track.id}
          engine={engine}
          project={project}
          pageId={pageId}
          track={track}
          asset={asset}
          gestures={gestures}
          top={at * rowHeight}
          rowHeight={rowHeight}
          scale={scale}
          duration={duration}
          left={left}
          width={width}
          active={active}
          selected={selected === track.id}
          unit={unit}
          onSelect={select}
        />
      );
    });
}
