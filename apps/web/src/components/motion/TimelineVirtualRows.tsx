import { memo, type ComponentProps, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { Asset, EnginePort, MotionAudioTrack } from "@musart/core";
import { useVirtualList } from "../shared/scroll/use-virtual-list";
import { TimelineRows } from "./TimelineRows";
import { AudioRows } from "./audio/AudioRows";

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

/** Scroll admission belongs to this leaf, never to the transport or the panel shell. */
export const TimelineVirtualRows = memo(function TimelineVirtualRows({
  viewport,
  audioTracks,
  assets,
  onAudioError,
  ...props
}: Props) {
  const { t } = useTranslation("motion");
  const virtual = useVirtualList(
    props.rows.length + audioTracks.length,
    props.rowHeight,
    viewport,
    5,
  );
  return (
    <div
      className="motion-row-space"
      style={{ height: Math.max(virtual.height, 140) }}
      tabIndex={0}
      role="group"
      aria-label={t("selectKeysArea")}
      onPointerDown={(event) => {
        if (props.interactive !== false)
          props.gestures?.beginMarquee(event, props.rows, props.rowHeight);
      }}
    >
      <TimelineRows {...props} first={virtual.first} last={virtual.last} />
      <AudioRows
        key={props.compositionId}
        engine={props.engine}
        tracks={audioTracks}
        assets={assets}
        transport={props.transport}
        first={virtual.first}
        last={virtual.last}
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
      />
    </div>
  );
});
