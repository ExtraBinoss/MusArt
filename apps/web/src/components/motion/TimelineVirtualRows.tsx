import {
  memo,
  useCallback,
  useSyncExternalStore,
  type ComponentProps,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { Asset, EnginePort, MotionAudioTrack } from "@musart/core";
import { useVirtualList } from "../shared/scroll/use-virtual-list";
import { TimelineControlTooltips } from "./control-tooltips";
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
  gutter?: number;
};
type LabelProps = Omit<
  Props,
  "pixelsPerSecond" | "duration" | "left" | "width" | "unit" | "onZoomRange"
>;

// Legacy row ports require temporal fields, but HTML gutter labels never consume them.
const LABEL_TIME = { pixelsPerSecond: 1, duration: 0, left: 0, width: 0, unit: "ms" } as const;
const LABEL_ADMISSION = { synchronousScroll: true } as const;

/** The canvas body does not subscribe to HTML label admission. */
export const TimelineVirtualRows = memo(function TimelineVirtualRows({
  viewport,
  audioTracks,
  assets,
  onAudioError,
  gutter,
  ...props
}: Props) {
  const { t } = useTranslation("motion");
  const renderLabels = useCallback(
    (host: TimelineCanvasHost) => (
      <LabelsVirtualRows
        viewport={viewport}
        audioTracks={audioTracks}
        assets={assets}
        onAudioError={onAudioError}
        host={host}
        rows={props.rows}
        rowHeight={props.rowHeight}
        selected={props.selected}
        engine={props.engine}
        compositionId={props.compositionId}
        transport={props.transport}
        gestures={props.gestures}
        drag={props.drag}
        interactive={props.interactive}
        onToggle={props.onToggle}
        onSelect={props.onSelect}
        onError={props.onError}
      />
    ),
    [
      viewport,
      audioTracks,
      assets,
      onAudioError,
      props.rows,
      props.rowHeight,
      props.selected,
      props.engine,
      props.compositionId,
      props.transport,
      props.gestures,
      props.drag,
      props.interactive,
      props.onToggle,
      props.onSelect,
      props.onError,
    ],
  );
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
        engine={props.engine}
        compositionId={props.compositionId}
        rows={props.rows}
        rowHeight={props.rowHeight}
        selected={props.selected}
        pixelsPerSecond={props.pixelsPerSecond}
        duration={props.duration}
        unit={props.unit}
        transport={props.transport}
        gestures={props.gestures}
        drag={props.drag}
        interactive={props.interactive}
        onSelect={props.onSelect}
        onError={props.onError}
        onZoomRange={props.onZoomRange}
        viewport={viewport}
        gutter={gutter}
        audioTracks={audioTracks}
        assets={assets}
        onAudioError={onAudioError}
      >
        {renderLabels}
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
}: LabelProps & { host: TimelineCanvasHost }) {
  const { first, last } = useVirtualList(
    props.rows.length + audioTracks.length,
    props.rowHeight,
    viewport,
    5,
    LABEL_ADMISSION,
  );
  const selectedAudioId = useSyncExternalStore(
    host.subscribeAudioSelection,
    host.readSelectedAudio,
    host.readSelectedAudio,
  );
  return (
    <TimelineControlTooltips value={false}>
      <TimelineRows {...props} {...LABEL_TIME} first={first} last={last} labelsOnly />
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
        scale={LABEL_TIME.pixelsPerSecond}
        duration={LABEL_TIME.duration}
        left={LABEL_TIME.left}
        width={LABEL_TIME.width}
        active={props.interactive ?? true}
        visualSelected={props.selected.size > 0}
        unit={LABEL_TIME.unit}
        onError={onAudioError}
        labelsOnly
        selectedAudioId={selectedAudioId}
        onAudioSelect={host.selectAudio}
      />
    </TimelineControlTooltips>
  );
});
