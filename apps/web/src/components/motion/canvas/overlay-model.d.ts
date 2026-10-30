import type { EnginePort } from "@musart/core";
import type { TimelineGestures } from "../gestures";
import type { TimelineLayerDrag } from "../layer-drag/use-timeline-layer-drag";
import type { TimelineTransport, TimelineUnit } from "../model";
import type { createAudioTrackGestures } from "../audio/gestures";
import type { TimelineCanvasHost } from "./host";
import type { TimelineCanvasHit, TimelineCanvasModel } from "./model";

export interface CanvasTimelineOverlayProps {
  host: TimelineCanvasHost;
  model?: TimelineCanvasModel;
  engine: EnginePort;
  compositionId: string;
  transport: TimelineTransport;
  gestures?: TimelineGestures;
  drag?: TimelineLayerDrag;
  unit: TimelineUnit;
  interactive: boolean;
  onSelect(this: void, id: string, additive: boolean): void;
  onError?: (this: void, message: string) => void;
  onAudioError(this: void, error: unknown): void;
  onZoomRange?: (this: void, start: number, end: number) => void;
}
export interface CanvasTimelineTargetProps extends CanvasTimelineOverlayProps {
  hit: TimelineCanvasHit;
  audioGestures: ReturnType<typeof createAudioTrackGestures>;
}
