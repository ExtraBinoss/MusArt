import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { WorkspaceSource } from "../artboards/workspace";
import { createViewportActions } from "../session/viewport-actions";
import { ViewMotion } from "./motion";
import {
  constrainView,
  fitView,
  INITIAL_VIEW,
  pan,
  wheelPixels,
  wheelZoomFactor,
  WHEEL_PAN_SPEED,
} from "./view";
const PAN_SETTLE_MS = 100;
interface PanIdle {
  timer: ReturnType<typeof setTimeout> | undefined;
}
function clearPanIdle(idle: PanIdle) {
  clearTimeout(idle.timer);
  idle.timer = undefined;
}

function createMotion(
  workspace: WorkspaceSource,
  viewport: RefObject<HTMLDivElement | null>,
  media: MediaQueryList,
) {
  return new ViewMotion({
    clock: {
      now: () => performance.now(),
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    },
    reduced: () => media.matches,
    constrain: (next) => {
      const rect = viewport.current?.getBoundingClientRect();
      return rect ? constrainView(next, workspace.read(), rect) : next;
    },
  });
}

export function useViewport({
  engine,
  workspace,
  viewport,
  layoutKey,
  projectId,
}: {
  engine: EnginePort;
  workspace: WorkspaceSource;
  viewport: RefObject<HTMLDivElement | null>;
  layoutKey: string;
  projectId: string;
}) {
  const media = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)"), []);
  const motion = useMemo(
    () => createMotion(workspace, viewport, media),
    [workspace, viewport, media],
  );
  const view = useSyncExternalStore(
    motion.subscribeSettled,
    motion.readSettled,
    motion.readSettled,
  );
  const viewRef = useRef(view);
  const actions = useMemo(() => createViewportActions(engine), [engine]);
  const panIdle = useMemo<PanIdle>(() => ({ timer: undefined }), []);
  useEffect(() => {
    motion.activate();
    viewRef.current = motion.read();
    const stop = motion.subscribe(() => {
      viewRef.current = motion.read();
    });
    const changed = () => {
      if (media.matches) motion.finish();
    };
    media.addEventListener("change", changed);
    return () => {
      stop();
      media.removeEventListener("change", changed);
      motion.dispose();
    };
  }, [motion, media]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rect = viewport.current?.getBoundingClientRect();
      if (rect) motion.jump(fitView(workspace.read(), rect));
    });
    return () => cancelAnimationFrame(frame);
  }, [motion, viewport, projectId, layoutKey, workspace]);
  useEffect(
    () =>
      actions.subscribe((action) => {
        clearPanIdle(panIdle);
        const handlers = {
          fit: () => {
            const rect = viewport.current?.getBoundingClientRect();
            if (rect) motion.animateTo(fitView(workspace.read(), rect));
          },
          reset: () => motion.animateTo(INITIAL_VIEW),
          recenter: () => motion.animateTo({ ...motion.read(), x: 0, y: 0 }),
          zoomIn: () => motion.zoomBy(1.2, { x: 0, y: 0 }),
          zoomOut: () => motion.zoomBy(1 / 1.2, { x: 0, y: 0 }),
        };
        handlers[action]();
      }),
    [actions, workspace, motion, viewport, panIdle],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      clearPanIdle(panIdle);
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey)
        motion.zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode, rect.height), {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        });
      else {
        motion.stop(false);
        const dx = wheelPixels(event.deltaX, event.deltaMode, rect.width) * WHEEL_PAN_SPEED,
          dy = wheelPixels(event.deltaY, event.deltaMode, rect.height) * WHEEL_PAN_SPEED;
        motion.jump(
          pan(
            motion.read(),
            event.shiftKey && dx === 0 ? dy : dx,
            event.shiftKey && dx === 0 ? 0 : dy,
          ),
          false,
        );
        panIdle.timer = setTimeout(() => {
          panIdle.timer = undefined;
          motion.stop();
        }, PAN_SETTLE_MS);
      }
    };
    const observer = new ResizeObserver(() => motion.jump(motion.read()));
    const interrupt = () => {
      clearPanIdle(panIdle);
      motion.stop();
    };
    observer.observe(element);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("pointerdown", interrupt, true);
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("pointerdown", interrupt, true);
      clearPanIdle(panIdle);
    };
  }, [motion, viewport, panIdle]);
  return { view, viewRef, motion, actions };
}
