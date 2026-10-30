import { memo, useSyncExternalStore, type ComponentProps, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { Asset, EnginePort, MotionAudioTrack } from "@musart/core";
import { useVirtualList } from "../shared/scroll/use-virtual-list";
import { TimelineRows } from "./TimelineRows";
import { AudioRows } from "./audio/AudioRows";
import { CanvasTimelineBody } from "./canvas/CanvasTimelineBody";
import type { TimelineCanvasHost } from "./canvas/host";

type Props = Omit<
  ComponentProps<typeof TimelineRows>,
  "first" | "last" | "engine" | "compositionId"
> & {
  engine: EnginePort;
  compositionId: string;
  viewport: RefObject<HTMLDivElement | null>;
  audioTracks: readonly MotionAudioTrack[];
  assets: Record<string, Asset>;
  onAudioError: (error: unknown) => void;
};

/** The canvas body does not subscribe to HTML label admission. */
export const TimelineVirtualRows = memo(function TimelineVirtualRows({
  viewport,
  audioTracks,
  assets,
  onAudioError,
  ...props
}: Props) {
  const { t } = useTranslation("motion");
  return (
    <div
      className="motion-row-space"
      style={{ height: Math.max((props.rows.length + audioTracks.length) * props.rowHeight, 140) }}
      tabIndex={0}
      role="group"
      aria-label={t("selectKeysArea")}
      onPointerDown={(event) => {
        if (props.interactive !== false)
          props.gestures?.beginMarquee(event, props.rows, props.rowHeight);
      }}
    >
      <CanvasTimelineBody
        key={props.compositionId}
        {...props}
        viewport={viewport}
        audioTracks={audioTracks}
        assets={assets}
        onAudioError={onAudioError}
      >
        {(host) => (
          <LabelsVirtualRows
            {...props}
            viewport={viewport}
            audioTracks={audioTracks}
            assets={assets}
            onAudioError={onAudioError}
            host={host}
          />
        )}
      </CanvasTimelineBody>
    </div>
  );
});

/** Only this leaf admits adjacent HTML gutter rows during scrolling. */
const LabelsVirtualRows = memo(function LabelsVirtualRows({
  viewport,
  audioTracks,
  assets,
  onAudioError,
  host,
  ...props
}: Props & { host: TimelineCanvasHost }) {
  const { first, last } = useVirtualList(
    props.rows.length + audioTracks.length,
    props.rowHeight,
    viewport,
    5,
  );
  const selectedAudioId = useSyncExternalStore(
    host.subscribeAudioSelection,
    host.readSelectedAudio,
    host.readSelectedAudio,
  );
  return (
    <>
      <TimelineRows {...props} first={first} last={last} labelsOnly />
      <AudioRows
        key={props.compositionId}
        engine={props.engine}
        tracks={audioTracks}
        assets={assets}
        transport={props.transport}
        first={first}
        last={last}
        offset={props.rows.length}
        rowHeight={props.rowHeight}
        scale={props.pixelsPerSecond}
        duration={props.duration}
        left={props.left}
        width={props.width}
        active={props.interactive ?? true}
        visualSelected={props.selected.size > 0}
        unit={props.unit}
        onError={onAudioError}
        labelsOnly
        selectedAudioId={selectedAudioId}
        onAudioSelect={host.selectAudio}
      />
    </>
  );
});
