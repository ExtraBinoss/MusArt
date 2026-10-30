import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { EnginePort, MotionAnimationPreset } from "@musart/core";
import { createTransitionPreviewSession } from "../transitions/preview-session";

/** A single retained GPU session moves its canvas between hovered cards. Idle tiles own no loop. */
export function PresetPreview({
  engine,
  preset,
  mount,
  onError,
}: {
  engine: EnginePort;
  preset?: MotionAnimationPreset;
  mount: HTMLDivElement | null;
  onError: () => void;
}) {
  const destination = useRef<HTMLDivElement | null>(null);
  const source = useRef<ReturnType<typeof createTransitionPreviewSession> | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const session = createTransitionPreviewSession(engine, {
      onFrame(canvas) {
        const host = destination.current;
        if (host && canvas.parentElement !== host) host.replaceChildren(canvas);
      },
      onError,
    });
    source.current = session;
    return () => {
      source.current = null;
      destination.current?.replaceChildren();
      void session.dispose().catch((error) => globalThis.reportError(error));
    };
  }, [engine, onError]);
  useEffect(() => {
    const session = source.current;
    destination.current?.replaceChildren();
    destination.current = mount;
    if (!session || !preset || !mount) {
      session?.play(false);
      session?.visible(false);
      return;
    }
    session.update({ style: "fade", preset, placement: "in", duration: preset.duration });
    let intersecting = true;
    const visibility = () => {
      session.visible(!document.hidden && intersecting);
      session.play(!document.hidden && intersecting && !reduced);
    };
    const observer = new IntersectionObserver((entries) => {
      intersecting = !!entries[0]?.isIntersecting;
      visibility();
    });
    observer.observe(mount);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      session.play(false);
      session.visible(false);
      mount.replaceChildren();
    };
  }, [preset, mount, reduced]);
  return null;
}
