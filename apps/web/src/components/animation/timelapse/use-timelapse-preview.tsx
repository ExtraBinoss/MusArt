import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { evaluateReplay, type ReplaySpec } from "@musart/core";
import type { createRenderSession, FontResolver, MediaSourceResolver } from "@musart/render";
import {
  createReplayTiming,
  replayFrame,
  replayFrameIndex,
} from "../../../services/animation/replay-timing";
import { createSliderValue } from "../../ui/slider-value";

interface Controls {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  release: () => Promise<void>;
}

/** One retained GPU preview; frame requests coalesce and never enter document/React state. */
export function useTimelapsePreview(
  spec: ReplaySpec | null,
  pageId: string,
  duration: number,
  active: boolean,
  fontResolver?: FontResolver,
  mediaResolver?: MediaSourceResolver,
  selection?: readonly string[],
  autoPlay = false,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const slider = useMemo(() => createSliderValue([0]), []);
  const clock = useRef<HTMLOutputElement>(null);
  const controls = useRef<Controls | null>(null);
  const durationRef = useRef(duration);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<"preparing" | "ready" | "failed">("preparing");
  useLayoutEffect(() => {
    durationRef.current = duration;
    controls.current?.pause();
    controls.current?.seek(0);
  }, [duration]);
  useEffect(() => {
    if (!spec || !active) return;
    let stopped = false;
    let renderer: ReturnType<typeof createRenderSession> | undefined;
    let crop: ReturnType<typeof import("@musart/render").selectionFrameScope> | undefined;
    let requested: number | null = null;
    let draining = false;
    let frame = 0;
    let position = 0;
    let lastRequested = -1;
    let ready = false;
    let advancing = false;
    let disposal: Promise<void> | null = null;
    const host = viewport.current;
    function pause() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (advancing) {
        advancing = false;
        setPlaying(false);
      }
    }
    async function drain() {
      if (draining) return;
      draining = true;
      try {
        if (!renderer) {
          const { createRenderSession } = await import("@musart/render");
          if (stopped) return;
          renderer = createRenderSession({
            maxBytes: 64 * 1024 * 1024,
            fontResolver,
            mediaResolver,
          });
        }
        const final = evaluateReplay(spec!, spec!.duration).pages.find(
          (page) => page.id === pageId,
        );
        if (!final) throw new Error("Replay page is missing.");
        if (!crop)
          crop = selection?.length
            ? (await import("@musart/render")).selectionFrameScope(final, selection)
            : { page: final, frame: (page) => page };
        while (requested !== null && !stopped) {
          const index = requested;
          requested = null;
          const timing = createReplayTiming(durationRef.current, 30, spec!.duration);
          const sample = replayFrame(timing, index);
          const project = evaluateReplay(spec!, sample.historyTime);
          const page = project.pages.find((item) => item.id === pageId) ?? { ...final, layers: [] };
          await renderer.withCanvasFrame(
            crop.frame({ ...page, width: final.width, height: final.height }),
            { ...spec!.assets, ...project.assets },
            (canvas) => {
              if (stopped || !host) return;
              if (canvas.parentElement !== host) host.replaceChildren(canvas);
              host.dataset.frame = String(index);
              host.dataset.historyTime = String(sample.historyTime);
              if (!ready) {
                ready = true;
                setStatus("ready");
                if (autoPlay) controls.current?.play();
              }
            },
            { scale: Math.min(1, 480 / Math.max(crop.page.width, crop.page.height)) },
          );
        }
      } catch {
        if (!stopped) {
          pause();
          setStatus("failed");
        }
      } finally {
        draining = false;
      }
    }
    function seek(time: number) {
      const timing = createReplayTiming(durationRef.current, 30, spec!.duration);
      position = Math.max(0, Math.min(timing.duration, time));
      slider.set([position]);
      if (clock.current)
        clock.current.textContent = `${position.toFixed(1)} / ${timing.duration} s`;
      const index = replayFrameIndex(timing, position);
      if (index === lastRequested) return;
      lastRequested = index;
      requested = index;
      void drain();
    }
    function release() {
      stopped = true;
      cancelAnimationFrame(frame);
      controls.current = null;
      host?.replaceChildren();
      return (disposal ??= renderer?.dispose() ?? Promise.resolve());
    }
    controls.current = {
      seek: (time) => {
        pause();
        seek(time);
      },
      pause,
      release,
      play: () => {
        pause();
        if (position >= durationRef.current) position = 0;
        advancing = true;
        setPlaying(true);
        const started = performance.now() - position * 1000;
        function tick(now: number) {
          if (stopped) return;
          seek((now - started) / 1000);
          if (position < durationRef.current) frame = requestAnimationFrame(tick);
          else pause();
        }
        frame = requestAnimationFrame(tick);
      },
    };
    void Promise.resolve().then(() => {
      if (stopped) return;
      setStatus("preparing");
      setPlaying(false);
      seek(0);
    });
    return () => {
      void release().catch(() => {});
    };
  }, [spec, pageId, active, fontResolver, mediaResolver, slider, selection, autoPlay]);
  return { viewport, slider, clock, status, playing, controls };
}
