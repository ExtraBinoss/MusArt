import type { EnginePort } from "@musart/core";
import { boxSelection } from "../interaction/gestures";
import { captureGestureOrigin, isGestureOriginCurrent } from "../interaction/gesture-origin";
import { attachmentSelection } from "../../state/selection/attachments";
import type { Point } from "../viewport/view";

interface Scope {
  initial: readonly string[];
  additive: boolean;
  intersect: boolean;
}
interface Clock {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

/** At most one selection publication per frame; release flushes, cancellation restores its own draft. */
export function createLiveMarquee(engine: EnginePort, clock: Clock) {
  let session: {
    origin: ReturnType<typeof captureGestureOrigin>;
    initial: readonly string[];
    last: readonly string[];
  } | null = null;
  let pending: { from: Point; to: Point; scope: Scope } | null = null;
  let frame: number | null = null;
  function clearFrame() {
    if (frame !== null) clock.cancel(frame);
    frame = null;
  }
  function publish() {
    const request = pending,
      current = session;
    pending = null;
    if (!request || !current || !isGestureOriginCurrent(engine, current.origin)) return;
    const snapshot = engine.getSnapshot();
    if (snapshot.selection !== current.last) {
      session = null;
      return;
    }
    const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
    const selected = boxSelection(
      page,
      request.from,
      request.to,
      request.scope.intersect ? "intersect" : "contain",
    );
    attachmentSelection(engine).clear();
    const ids = request.scope.additive ? [...new Set([...current.initial, ...selected])] : selected;
    engine.select(ids);
    const next = engine.getSnapshot().selection;
    // A reentrant subscriber may replace the selection/document during publication.
    if (
      isGestureOriginCurrent(engine, current.origin) &&
      next.length === ids.length &&
      next.every((id, at) => id === ids[at])
    )
      current.last = next;
    else session = null;
  }
  return {
    queue(from: Point, to: Point, scope: Scope) {
      if (!session)
        session = {
          origin: captureGestureOrigin(engine),
          initial: [...scope.initial],
          last: engine.getSnapshot().selection,
        };
      pending = { from, to, scope };
      if (frame === null)
        frame = clock.request(() => {
          frame = null;
          publish();
        });
    },
    commit() {
      clearFrame();
      publish();
      session = null;
    },
    cancel() {
      clearFrame();
      pending = null;
      const current = session;
      session = null;
      if (
        current &&
        isGestureOriginCurrent(engine, current.origin) &&
        engine.getSnapshot().selection === current.last
      )
        engine.select([...current.initial]);
    },
    discard() {
      clearFrame();
      pending = null;
      session = null;
    },
  };
}
