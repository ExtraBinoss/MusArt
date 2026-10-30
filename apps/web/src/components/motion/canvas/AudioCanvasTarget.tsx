import { motionTimeToSeconds, isAudioAsset } from "@musart/core";
import { useTranslation } from "react-i18next";
import { AudioClipMenu, AudioFadeButtons } from "../audio/AudioClipActions";
import { TrackDurationTooltip } from "../TrackDurationTooltip";
import type { CanvasTimelineTargetProps } from "./overlay-model";

/** Only the pointed/focused sound owns DOM controls; its entire artwork belongs to Canvas. */
export function AudioCanvasTarget(props: CanvasTimelineTargetProps) {
  const { t } = useTranslation("motionAudio");
  const model = props.model ?? props.host.readModel(),
    snapshot = props.engine.getSnapshot(),
    page = snapshot.project.pages.find((page) => page.id === props.compositionId),
    hit = props.hit;
  if (!("trackId" in hit)) return null;
  const track = page?.motion?.audioTracks?.find((track) => track.id === hit.trackId),
    asset = track && model.assets[track.assetId];
  if (!page || !track || !asset || !isAudioAsset(asset)) return null;
  const select = () => {
    const current = props.engine.getSnapshot();
    if (current.project !== snapshot.project || current.pageId !== page.id) return false;
    props.gestures?.selectKeys([], false);
    props.host.selectAudio(track.id);
    if (current.selection.length) props.engine.select([]);
    return true;
  };
  const width = Math.max(
    2,
    (motionTimeToSeconds(track.end) - motionTimeToSeconds(track.start)) * model.scale,
  );
  return (
    <div
      className="motion-row motion-audio-row motion-canvas-active-overlay"
      data-layer-kind="audio"
      data-audio-track-id={track.id}
      style={{
        top:
          (model.rows.length + model.audioTracks.findIndex((item) => item.id === track.id)) *
          model.rowHeight,
        height: model.rowHeight,
      }}
      onKeyDown={(event) => {
        if (!props.interactive || !["Delete", "Backspace"].includes(event.key)) return;
        if (
          event.target instanceof Element &&
          event.target.closest("input,textarea,[role=slider],[contenteditable]")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (select()) props.engine.execute({ type: "deleteMotionAudioTrack", trackId: track.id });
      }}
    >
      <span aria-hidden />
      <div className="motion-row-time">
        <AudioClipMenu
          engine={props.engine}
          track={track}
          disabled={!props.interactive}
          onSelect={select}
        >
          {(open) => (
            <TrackDurationTooltip
              trackId={track.id}
              start={track.start}
              end={track.end}
              unit={props.unit}
            >
              <div
                className="motion-track-wrap"
                data-track-id={track.id}
                style={{
                  left: `var(--motion-trim-left, ${motionTimeToSeconds(track.start) * model.scale}px)`,
                  width: `var(--motion-trim-width, ${width}px)`,
                }}
              >
                <button
                  type="button"
                  className="motion-track motion-audio-track"
                  disabled={!props.interactive}
                  aria-label={t("clip", { name: track.name })}
                  onClick={select}
                  onPointerDown={(event) => {
                    if (select())
                      props.audioGestures.begin(event, track, asset, "move", model.scale);
                  }}
                />
                {(["start", "end"] as const).map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    className={`motion-trim-handle is-${edge}`}
                    disabled={!props.interactive}
                    aria-label={t(edge === "start" ? "trimStart" : "trimEnd", { name: track.name })}
                    onPointerDown={(event) => {
                      if (select())
                        props.audioGestures.begin(event, track, asset, edge, model.scale);
                    }}
                  />
                ))}
                {width > 32 && <AudioFadeButtons disabled={!props.interactive} onOpen={open} />}
              </div>
            </TrackDurationTooltip>
          )}
        </AudioClipMenu>
      </div>
    </div>
  );
}
