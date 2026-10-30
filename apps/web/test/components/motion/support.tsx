import { useSyncExternalStore } from "react";
import { vi } from "vitest";
import type { Composition, EnginePort, MotionTime } from "@musart/core";
import type {
  TimelineTransport,
  TimelineTransportState,
} from "../../../src/components/motion/model";
import { TimelinePanel } from "../../../src/components/motion/TimelinePanel";

export function makeTransport(page: Composition) {
  let state: TimelineTransportState = {
    compositionId: page.id,
    mode: "motion",
    time: { value: 0, rate: 1 },
    duration: page.motion!.duration,
    frameRate: page.motion!.frameRate,
    playing: false,
    playbackMode: "once",
  };
  const listeners = new Set<() => void>();
  let editingTime: MotionTime | null = null;
  const update = (patch: Partial<TimelineTransportState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const transport: TimelineTransport = {
    read: () => state,
    readEditingTime: () => editingTime,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seek: vi.fn((time: MotionTime) => update({ time })),
    play: vi.fn(() => update({ playing: true })),
    pause: vi.fn(() => update({ playing: false })),
    setPlaybackMode: vi.fn((playbackMode: TimelineTransportState["playbackMode"]) =>
      update({ playbackMode }),
    ),
  };
  const editTime = (time: MotionTime | null) => {
    editingTime = time;
    for (const listener of listeners) listener();
  };
  return { transport, update, editTime, listeners };
}

export function PanelHost({
  engine,
  transport,
  onClose = () => {},
}: {
  engine: EnginePort;
  transport: TimelineTransport;
  onClose?: () => void;
}) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  return (
    <TimelinePanel engine={engine} snapshot={snapshot} transport={transport} onClose={onClose} />
  );
}

export function pointer(node: Element, type: string, clientX: number, clientY = 0) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperty(event, "pointerId", { value: 7 });
  node.dispatchEvent(event);
}
