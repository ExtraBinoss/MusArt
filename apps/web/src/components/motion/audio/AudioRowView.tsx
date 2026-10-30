import { memo, useCallback } from "react";
import { Music2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  motionTimeToSeconds,
  type AudioAsset,
  type EnginePort,
  type MotionAudioTrack,
  type Project,
} from "@musart/core";
import type { TimelineUnit } from "../model";
import { TrackDurationTooltip } from "../TrackDurationTooltip";
import type { createAudioTrackGestures } from "./gestures";
import { AudioTrackName } from "./AudioTrackName";
import { AudioWaveform } from "./AudioWaveform";
import { AudioClipMenu, AudioGainControl, AudioFadeButtons } from "./AudioClipActions";
import "./messages";

export interface AudioRowViewProps {
  engine: EnginePort;
  project: Project;
  pageId: string;
  track: MotionAudioTrack;
  asset: AudioAsset;
  gestures: ReturnType<typeof createAudioTrackGestures>;
  top: number;
  rowHeight: number;
  scale: number;
  duration: number;
  left: number;
  width: number;
  active: boolean;
  selected: boolean;
  unit: TimelineUnit;
  onSelect: (id: string) => void;
}

/** Retained rows keep their menus, waveform and handlers during vertical window changes. */
export const AudioRowView = memo(function AudioRowView({
  engine,
  project,
  pageId,
  track,
  asset,
  gestures,
  top,
  rowHeight,
  scale,
  duration,
  left,
  width,
  active,
  selected,
  unit,
  onSelect,
}: AudioRowViewProps) {
  const { t } = useTranslation("motionAudio");
  const start = motionTimeToSeconds(track.start),
    end = Math.min(duration, motionTimeToSeconds(track.end));
  const clipWidth = Math.max(2, (end - start) * scale),
    clipLeft = start * scale;
  const isCurrent = useCallback(() => {
    const snapshot = engine.getSnapshot();
    return (
      snapshot.project === project &&
      snapshot.pageId === pageId &&
      snapshot.project.assets[track.assetId] === asset &&
      snapshot.project.pages
        .find((page) => page.id === pageId)
        ?.motion?.audioTracks?.find((item) => item.id === track.id) === track
    );
  }, [engine, project, pageId, track, asset]);
  const select = useCallback(() => {
    if (!isCurrent()) return false;
    onSelect(track.id);
    return true;
  }, [isCurrent, onSelect, track.id]);
  return (
    <div
      className={`motion-row motion-audio-row ${selected ? "is-selected" : ""}`}
      data-layer-kind="audio"
      data-audio-track-id={track.id}
      data-muted={track.mute || undefined}
      style={{ top, height: rowHeight }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (
          active &&
          isCurrent() &&
          selected &&
          ["Delete", "Backspace"].includes(event.key) &&
          !(
            event.target instanceof Element &&
            event.target.closest("input,textarea,[contenteditable],[role=slider]")
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          engine.execute({ type: "deleteMotionAudioTrack", trackId: track.id });
        }
      }}
    >
      <div className="motion-row-label" style={{ paddingLeft: 30 }}>
        <Music2 size={12} aria-hidden />
        <AudioTrackName engine={engine} track={track} active={active} onSelect={select} />
        <AudioGainControl engine={engine} track={track} disabled={!active} onSelect={select} />
      </div>
      <div className="motion-row-time">
        {end > start && (
          <AudioClipMenu engine={engine} track={track} disabled={!active} onSelect={select}>
            {(openProcessing) => (
              <TrackDurationTooltip
                trackId={track.id}
                start={track.start}
                end={track.end}
                unit={unit}
              >
                <div
                  className="motion-track-wrap"
                  style={{
                    left: `var(--motion-trim-left, ${clipLeft}px)`,
                    width: `var(--motion-trim-width, ${clipWidth}px)`,
                  }}
                >
                  <button
                    type="button"
                    className="motion-track motion-audio-track"
                    disabled={!active}
                    aria-label={t("clip", { name: track.name })}
                    onClick={select}
                    onPointerDown={(event) => {
                      if (!select()) return;
                      gestures.begin(event, track, asset, "move", scale);
                    }}
                  >
                    <AudioWaveform
                      engine={engine}
                      asset={asset}
                      track={track}
                      width={clipWidth}
                      left={Math.max(0, left - clipLeft)}
                      visibleWidth={width}
                    />
                  </button>
                  <button
                    type="button"
                    className="motion-trim-handle is-start"
                    disabled={!active}
                    aria-label={t("trimStart", { name: track.name })}
                    onPointerDown={(event) => {
                      if (!select()) return;
                      gestures.begin(event, track, asset, "start", scale);
                    }}
                  />
                  <button
                    type="button"
                    className="motion-trim-handle is-end"
                    disabled={!active}
                    aria-label={t("trimEnd", { name: track.name })}
                    onPointerDown={(event) => {
                      if (!select()) return;
                      gestures.begin(event, track, asset, "end", scale);
                    }}
                  />
                  {clipWidth > 32 && (
                    <AudioFadeButtons disabled={!active} onOpen={openProcessing} />
                  )}
                </div>
              </TrackDurationTooltip>
            )}
          </AudioClipMenu>
        )}
      </div>
    </div>
  );
});
