import type { ViewportResizeLease } from "../session/viewport-resize";
import type { ViewMotion } from "./motion";
import { constrainView, type View } from "./view";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Driver {
  stop(): void;
  finished: Promise<void>;
}
interface Options {
  motion: ViewMotion;
  rect(): Rect | null;
  workspace(): { width: number; height: number };
  reduced(): boolean;
  spring(update: (progress: number) => void): Driver;
  scope?(): unknown;
}

const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;
const valid = (rect: Rect | null): rect is Rect =>
  Boolean(
    rect &&
    Number.isFinite(rect.left + rect.top + rect.width + rect.height) &&
    rect.width > 0 &&
    rect.height > 0,
  );
const equal = (a: View, b: View) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/** Preserve screen-space artwork through one explicit layout reservation, not ordinary resizes. */
export function createResizeAnchor(options: Options) {
  let active: {
    lease: ViewportResizeLease;
    expected: Rect | null;
    correcting: boolean;
    finish(): void;
  } | null = null;

  function cancel() {
    active?.lease.cancel();
  }
  function capture(): ViewportResizeLease | undefined {
    cancel();
    const before = options.rect();
    if (!valid(before)) return;
    options.motion.stop(false);
    const view = options.motion.read();
    const scope = options.scope?.();
    let target: View | undefined;
    let driver: Driver | undefined,
      applied = false,
      retired = false;
    let resolve!: () => void;
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    function retire() {
      if (retired) return;
      retired = true;
      driver?.stop();
      if (active?.lease === lease) active = null;
      resolve();
    }
    function owns() {
      if (retired || active?.lease !== lease) return false;
      if (scope !== options.scope?.()) {
        retire();
        return false;
      }
      return true;
    }
    function complete() {
      if (!target || !owns()) return;
      options.motion.reframe(target);
      retire();
    }
    const lease: ViewportResizeLease = {
      finished,
      cancel: retire,
      apply() {
        if (!owns() || applied || !active) return;
        applied = true;
        const after = options.rect();
        if (!valid(after)) {
          retire();
          return;
        }
        active.expected = after;
        const from = {
          ...view,
          x: view.x + before.left + before.width / 2 - after.left - after.width / 2,
          y: view.y + before.top + before.height / 2 - after.top - after.height / 2,
        };
        target = constrainView(from, options.workspace(), after);
        const destination = target;
        if (equal(from, destination) || options.reduced()) {
          complete();
          return;
        }
        // Paint the exact old screen pose before the first frame. An exceptionally small
        // viewport then brings it within reach with a position-only spring, never a scale.
        options.motion.reframe(from, false);
        if (!owns() || !active) return;
        active.correcting = true;
        driver = options.spring((progress) => {
          if (!owns()) return;
          const t = Math.max(0, Math.min(1, progress));
          options.motion.reframe(
            {
              ...from,
              x: from.x + (destination.x - from.x) * t,
              y: from.y + (destination.y - from.y) * t,
            },
            false,
          );
        });
        if (retired) {
          driver.stop();
          return;
        }
        void driver.finished.then(complete);
      },
    };
    active = { lease, expected: null, correcting: false, finish: complete };
    return lease;
  }

  return {
    capture,
    cancel,
    finish: () => active?.finish(),
    resizeHandled() {
      if (!active?.correcting || !active.expected) return false;
      const current = options.rect();
      if (valid(current) && sameRect(current, active.expected)) return true;
      cancel();
      return false;
    },
  };
}
