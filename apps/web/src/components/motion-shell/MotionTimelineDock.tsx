import { Activity, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useAnimate, useReducedMotion } from "motion/react";
import type { EnginePort, SessionSnapshot } from "@musart/core";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import { useEngine } from "../../state/session/editor";
import { createMotionTransport } from "../../services/motion/transport";
import { TimelinePanel } from "../motion/TimelinePanel";
import type { TimelineTransport } from "../motion/model";
import "./motion-shell.css";

const RetainedPanel = memo(TimelinePanel);
const closedStyle = { opacity: 0, transform: "translateY(100%)" };

/** Timeline visibility is local presentation state; App/Canvas/Inspector never subscribe to it. */
export const MotionTimelineDock = memo(function MotionTimelineDock({
  engine,
}: {
  engine: EnginePort;
}) {
  const snapshot = useEngine(engine);
  const open = useAtomValue(timelineOpenAtom);
  const setOpen = useSetAtom(timelineOpenAtom);
  const reduced = Boolean(useReducedMotion());
  const transport = useMemo(() => createMotionTransport(engine), [engine]);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
  const motionEnabled = page?.motion?.mode === "motion";
  useEffect(() => {
    if (!motionEnabled) transport.pause();
  }, [motionEnabled, transport]);
  const close = useCallback(() => {
    // The timeline close button disappears. Return keyboard focus to its persistent canvas toggle.
    document.querySelector<HTMLElement>(".canvas-timeline-toggle")?.focus({ preventScroll: true });
    setOpen(false);
  }, [setOpen]);
  return (
    <ScopedDock
      key={JSON.stringify([snapshot.project.id, snapshot.pageId])}
      engine={engine}
      snapshot={snapshot}
      transport={transport}
      reduced={reduced}
      visible={open && motionEnabled}
      onClose={close}
    />
  );
});

interface SurfaceProps {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  transport: TimelineTransport;
  reduced: boolean;
  visible: boolean;
  onClose: () => void;
}

/** First use is lazy; a project/artboard key change drops the single retained surface. */
function ScopedDock(props: SurfaceProps) {
  const [mounted, setMounted] = useState(props.visible);
  if (props.visible && !mounted) setMounted(true);
  return mounted ? <DockSurface {...props} /> : null;
}

function DockSurface({ engine, snapshot, transport, reduced, visible, onClose }: SurfaceProps) {
  // Keep the animation scope outside Activity: hidden descendants disconnect their Effects.
  const [surface, animate] = useAnimate<HTMLDivElement>();
  const generation = useRef<symbol | null>(null);
  const [visibility, setVisibility] = useState({ requested: visible, hidden: false });
  const [lastVisibleSnapshot, retainSnapshot] = useState(snapshot);
  // Conditional render updates are synchronous: never hide a reopened boundary before its entry.
  if (visibility.requested !== visible) setVisibility({ requested: visible, hidden: false });
  if (visible && lastVisibleSnapshot !== snapshot) retainSnapshot(snapshot);
  // Animate the DOM directly after Activity reconnects refs. No descendant control bus is needed.
  useEffect(() => {
    if (!surface.current || reduced) return;
    const token = Symbol();
    generation.current = token;
    const animation = animate(
      surface.current,
      { opacity: visible ? 1 : 0, transform: visible ? "translateY(0%)" : "translateY(100%)" },
      { duration: visible ? 0.18 : 0.13, ease: [0.22, 1, 0.36, 1] },
    );
    void animation.then(() => {
      if (!visible && token === generation.current)
        setVisibility((current) =>
          current.requested ? current : { requested: false, hidden: true },
        );
    });
    return () => {
      generation.current = null;
      animation.stop();
    };
  }, [animate, surface, visible, reduced]);
  const scope = JSON.stringify([snapshot.project.id, snapshot.pageId]);
  const hidden = reduced ? !visible : visibility.hidden;
  return (
    <Activity mode={hidden ? "hidden" : "visible"}>
      <div
        ref={surface}
        className="motion-timeline-dock"
        data-motion-presence={hidden ? "hidden" : visible ? "present" : "exiting"}
        data-motion-scope={scope}
        data-canvas-control
        inert={!visible || undefined}
        aria-hidden={!visible || undefined}
        style={{
          ...(reduced && visible ? { opacity: 1, transform: "translateY(0%)" } : closedStyle),
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <RetainedPanel
          key={scope}
          engine={engine}
          snapshot={visible ? snapshot : lastVisibleSnapshot}
          transport={transport}
          onClose={onClose}
          active={visible}
        />
      </div>
    </Activity>
  );
}
