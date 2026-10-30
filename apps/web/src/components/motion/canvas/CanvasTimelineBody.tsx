import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { Asset, EnginePort, MotionAudioTrack } from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "../model";
import type { TimelineRow } from "../tree";
import type { TimelineGestures } from "../gestures";
import type { TimelineLayerDrag } from "../layer-drag/use-timeline-layer-drag";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { createTimelineCanvasHost } from "./host-state";
import { createTimelineCanvasSurface } from "./surface";
import { createTimelineCanvasWaveforms } from "./waveforms";
import { createTimelineCanvasActivity } from "./activity";
import type { TimelineCanvasHost } from "./host";
import type { TimelineCanvasModel } from "./model";
import { CanvasTimelineOverlay } from "./overlay";
import "./body.css";

const EMPTY_KEYS: ReadonlySet<string> = new Set();
const BODY_TOP = 32;
export interface CanvasTimelineBodyProps {
  viewport: RefObject<HTMLDivElement | null>;
  rows: readonly TimelineRow[];
  audioTracks: readonly MotionAudioTrack[];
  assets: Readonly<Record<string, Asset>>;
  selected: ReadonlySet<string>;
  pixelsPerSecond: number;
  duration: number;
  rowHeight: number;
  gutter?: number;
  engine: EnginePort;
  compositionId: string;
  transport: TimelineTransport;
  gestures?: TimelineGestures;
  drag?: TimelineLayerDrag;
  unit: TimelineUnit;
  interactive?: boolean;
  onSelect(this: void, id: string, additive: boolean): void;
  onError?: (this: void, message: string) => void;
  onAudioError(this: void, error: unknown): void;
  onZoomRange?: (this: void, start: number, end: number) => void;
  /** The label leaf subscribes only to discrete audio selection, never body scroll or frames. */
  children(this: void, host: TimelineCanvasHost): ReactNode;
}

/** The viewport-sized bitmap is independent of HTML row admission and transport frame renders. */
export const CanvasTimelineBody = memo(function CanvasTimelineBody(props: CanvasTimelineBodyProps) {
  const { t } = useTranslation("motion");
  const { viewport, engine, gestures, transport, onAudioError, children } = props,
    root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const model = useMemo<TimelineCanvasModel>(
    () => ({
      rows: props.rows,
      audioTracks: props.audioTracks,
      assets: props.assets,
      selectedLayerIds: props.selected,
      selectedKeyIds: gestures?.readSelected() ?? EMPTY_KEYS,
      scale: props.pixelsPerSecond,
      duration: props.duration,
      rowHeight: props.rowHeight,
      gutter: props.gutter ?? 244,
    }),
    [
      props.rows,
      props.audioTracks,
      props.assets,
      props.selected,
      gestures,
      props.pixelsPerSecond,
      props.duration,
      props.rowHeight,
      props.gutter,
    ],
  );
  const [binding] = useState(() => createTimelineCanvasHost(viewport, root, model));
  const attached = useRef<{ stop(): void; refresh(): void } | null>(null);
  const connect = useCallback(() => {
    const node = canvas.current,
      frame = root.current,
      scroll = viewport.current;
    if (!node || !frame || !scroll || attached.current) return;
    const surface = createTimelineCanvasSurface({
      canvas: node,
      frame,
      viewport: scroll,
      bodyTop: BODY_TOP,
      onError: onAudioError,
    });
    binding.attach(surface);
    const session = getMotionAudioSession(engine);
    const waveforms = session
      ? createTimelineCanvasWaveforms({
          engine,
          prepare: (asset) => session.preparation.waveform(asset),
          overscan: 2,
          cached: (asset) => session.preparation.cachedWaveform?.(asset),
          readModel: binding.host.readModel,
          publish: binding.waveforms,
          onError: onAudioError,
        })
      : null;
    let frameJob: number | null = null,
      playing = transport.read().playing,
      interacting = false,
      releaseHold: (() => void) | null = null,
      stopped = false;
    const refresh = () => {
      if (frameJob !== null || !waveforms) return;
      frameJob = requestAnimationFrame(() => {
        frameJob = null;
        waveforms.update(
          scroll.scrollTop,
          Math.max(0, scroll.clientHeight - BODY_TOP),
          scroll.scrollLeft,
          Math.max(0, scroll.clientWidth - binding.host.readModel().gutter),
        );
      });
    };
    const syncPause = () => {
      if (stopped) return;
      const paused = playing || interacting;
      waveforms?.setPaused(paused);
      if (paused && !releaseHold && session)
        releaseHold = session.preparation.holdWaveforms({ interrupt: false });
      if (!paused && releaseHold) {
        const release = releaseHold;
        releaseHold = null;
        release();
      }
      if (!paused) refresh();
    };
    const activity = createTimelineCanvasActivity({
      viewport: scroll,
      onChange(value) {
        interacting = value;
        syncPause();
      },
    });
    const resize = new ResizeObserver(refresh);
    syncPause();
    const stopTransport = transport.subscribe(() => {
      const next = transport.read().playing;
      if (playing === next) return;
      playing = next;
      syncPause();
    });
    scroll.addEventListener("scroll", refresh, { passive: true });
    resize.observe(scroll);
    attached.current = {
      refresh,
      stop() {
        stopped = true;
        scroll.removeEventListener("scroll", refresh);
        resize.disconnect();
        stopTransport();
        activity.dispose();
        if (frameJob !== null) cancelAnimationFrame(frameJob);
        waveforms?.dispose();
        releaseHold?.();
        releaseHold = null;
        binding.detach(surface);
      },
    };
    refresh();
  }, [viewport, binding, engine, transport, onAudioError]);
  const disconnect = useCallback(() => {
    attached.current?.stop();
    attached.current = null;
  }, []);
  useLayoutEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);
  // Parent scroll refs can attach after child layout effects; the bridge connects once after commit.
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);
  useLayoutEffect(() => {
    binding.update(model);
    attached.current?.refresh();
  }, [binding, model]);
  useLayoutEffect(() => {
    if (!gestures) return;
    const update = () => {
      const surface = binding.host.readSurface();
      surface?.update({
        ...binding.host.readModel(),
        draft: gestures.readPreview(),
        selectionPreview: gestures.readMarqueePreview(),
        selectedKeyIds: gestures.readSelected(),
      });
    };
    update();
    return gestures.subscribePreview(update);
  }, [binding, gestures]);
  return (
    <>
      <div className="motion-canvas-frame">
        <div
          ref={root}
          className="motion-canvas-root"
          data-timeline-canvas-root
          hidden={!props.rows.length && !props.audioTracks.length}
          tabIndex={0}
          role="group"
          aria-label={t("selectKeysArea")}
        >
          <canvas ref={canvas} data-timeline-canvas="true" aria-hidden />
          <CanvasTimelineOverlay
            host={binding.host}
            model={model}
            engine={engine}
            compositionId={props.compositionId}
            transport={props.transport}
            gestures={gestures}
            drag={props.drag}
            unit={props.unit}
            interactive={props.interactive ?? true}
            onSelect={props.onSelect}
            onError={props.onError}
            onAudioError={onAudioError}
            onZoomRange={props.onZoomRange}
          />
        </div>
      </div>
      {children(binding.host)}
    </>
  );
});
