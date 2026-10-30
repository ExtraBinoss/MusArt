import { useEffect, useMemo, useRef, useState } from "react";
import {
  motionTimeToSeconds,
  type AudioAsset,
  type EnginePort,
  type MotionAudioTrack,
} from "@musart/core";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { createMotionTransport } from "../../../services/motion/transport";
import { waveformPath } from "../../../services/motion/audio/waveform-path";
import { useRenderMetrics } from "../../../state/session/render-metrics";

export function AudioWaveform({
  engine,
  asset,
  track,
  width,
  left,
  visibleWidth,
}: {
  engine: EnginePort;
  asset: AudioAsset;
  track: MotionAudioTrack;
  width: number;
  left: number;
  visibleWidth: number;
}) {
  const node = useRef<SVGSVGElement>(null);
  useRenderMetrics(node);
  const [state, setState] = useState<{ asset: AudioAsset; peaks?: Float32Array; error?: string }>({
    asset,
  });
  if (state.asset !== asset) setState({ asset });
  useEffect(() => {
    let active = true;
    const service = getMotionAudioSession(engine);
    if (!service) return;
    const transport = createMotionTransport(engine);
    let playing = transport.read().playing;
    const request = () => {
      if (transport.read().playing) return;
      void service.preparation.waveform(asset).then(
        (peaks) => {
          if (active) setState({ asset, peaks });
        },
        (error: unknown) => {
          if (active && !(error instanceof DOMException && error.name === "AbortError"))
            setState({
              asset,
              error:
                error instanceof Error ? error.message : "Audio waveform could not be prepared.",
            });
        },
      );
    };
    request();
    const stop = transport.subscribe(() => {
      const next = transport.read().playing;
      if (playing && !next) request();
      playing = next;
    });
    return () => {
      active = false;
      stop();
    };
  }, [engine, asset]);
  const path = useMemo(
    () =>
      state.peaks
        ? waveformPath(state.peaks, {
            width,
            left,
            visibleWidth,
            sourceIn: motionTimeToSeconds(track.sourceIn),
            clipDuration: motionTimeToSeconds(track.end) - motionTimeToSeconds(track.start),
            sourceDuration: motionTimeToSeconds(asset.duration),
          })
        : "",
    [state.peaks, width, left, visibleWidth, track, asset.duration],
  );
  const visibleLeft = Math.max(0, Math.floor(left / 3) * 3),
    visible = Math.max(0, Math.min(width - visibleLeft, visibleWidth + 3));
  return (
    <svg
      ref={node}
      className="motion-audio-waveform"
      width={visible}
      height={16}
      viewBox={`${visibleLeft} 0 ${Math.max(1, visible)} 16`}
      style={{ left: visibleLeft }}
      aria-hidden
      data-preparing={(!state.peaks && !state.error) || undefined}
    >
      <title>{state.error}</title>
      <path d={path} className="motion-audio-envelope" />
      <path
        d={path}
        transform="translate(0 2.4) scale(1 0.7)"
        className="motion-audio-envelope-core"
      />
    </svg>
  );
}
