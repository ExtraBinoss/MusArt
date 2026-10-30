import type { TimelineCanvasRowPose } from "./model";

export const TIMELINE_ROW_POSITIONS_EVENT = "timeline-row-positions";
interface PositionOwner {
  readonly token: symbol;
  positions: ReadonlyMap<string, TimelineCanvasRowPose> | null;
}
const owners = new WeakMap<HTMLElement, PositionOwner>();
export function getTimelineCanvasRowPositions(root: HTMLElement) {
  return owners.get(root)?.positions ?? null;
}
function equal(
  a: ReadonlyMap<string, TimelineCanvasRowPose> | null,
  b: ReadonlyMap<string, TimelineCanvasRowPose>,
) {
  if (!a || a.size !== b.size) return false;
  for (const [key, next] of b) {
    const prior = a.get(key);
    if (
      !prior ||
      Math.abs(prior.top - next.top) > 0.001 ||
      prior.height !== next.height ||
      prior.zIndex !== next.zIndex ||
      prior.order !== next.order
    )
      return false;
  }
  return true;
}

/** Reads only the bounded HTML label window, never transient overlay rows or the full document. */
export function createTimelineCanvasRowPositions(root: HTMLElement) {
  const owned: PositionOwner = { token: Symbol("timeline-row-positions"), positions: null };
  owners.set(root, owned);
  const publish = (positions: ReadonlyMap<string, TimelineCanvasRowPose> | null) => {
    if (owners.get(root)?.token !== owned.token) return false;
    const changed = positions ? !equal(owned.positions, positions) : owned.positions !== null;
    if (changed) {
      owned.positions = positions;
      root.dispatchEvent(new Event(TIMELINE_ROW_POSITIONS_EVENT));
    }
    return changed;
  };
  return {
    read(viewport: HTMLElement, rowHeight: number, visibleHeight: number) {
      if (
        owners.get(root)?.token !== owned.token ||
        !Number.isFinite(rowHeight) ||
        rowHeight <= 0 ||
        !Number.isFinite(visibleHeight) ||
        visibleHeight < 0
      )
        return { positions: null, animating: false, changed: false };
      const origin = root.getBoundingClientRect().top;
      const limit = Math.min(512, Math.max(1, Math.ceil(visibleHeight / rowHeight) + 12));
      const positions = new Map<string, TimelineCanvasRowPose>();
      let animating = false,
        order = 0,
        inspected = 0;
      for (const node of viewport.querySelectorAll<HTMLElement>(
        '[data-labels-only="true"][data-motion-row-key]',
      )) {
        if (inspected++ >= limit) break;
        if (node.closest(".motion-canvas-active-overlay")) continue;
        const bounds = node.getBoundingClientRect();
        const key = node.dataset.motionRowKey;
        if (
          !key ||
          !Number.isFinite(bounds.top) ||
          !Number.isFinite(bounds.height) ||
          bounds.height <= 0
        )
          continue;
        positions.set(
          key,
          Object.freeze({
            top: bounds.top - origin + viewport.scrollTop,
            height: bounds.height,
            zIndex: node.dataset.layerReorderSource === "true" ? 4 : 0,
            order: order++,
          }),
        );
        animating ||=
          typeof node.getAnimations === "function" &&
          node
            .getAnimations()
            .some((animation) => animation.playState === "running" || animation.pending);
      }
      return { positions, animating, changed: publish(positions) };
    },
    clear: () => publish(null),
    dispose() {
      if (owners.get(root)?.token !== owned.token) return;
      publish(null);
      owners.delete(root);
    },
  };
}
