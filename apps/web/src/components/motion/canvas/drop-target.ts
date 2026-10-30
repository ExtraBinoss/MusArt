import type { TimelineCanvasHost } from "./host";
import { getTimelineCanvasRowPositions, TIMELINE_ROW_POSITIONS_EVENT } from "./row-positions";
import type { TimelineCanvasModel } from "./model";

interface CanvasDropOwner {
  readonly epoch: number;
  dispose(): void;
}
const owners = new WeakMap<HTMLElement, CanvasDropOwner>();
let nextEpoch = 0;
const rowIndexes = new WeakMap<TimelineCanvasModel["rows"], ReadonlyMap<string, number>>();
function indexesFor(rows: TimelineCanvasModel["rows"]) {
  let index = rowIndexes.get(rows);
  if (!index) {
    index = new Map(rows.map((row, at) => [row.key, at]));
    rowIndexes.set(rows, index);
  }
  return index;
}

/** A single transient native hit target lets the shared layer controller keep its DOM contract. */
export function installTimelineCanvasDropTarget(options: {
  readonly host: TimelineCanvasHost;
  readonly compositionId: string;
  readonly onPoseChange?: () => void;
}): () => void {
  const { host, compositionId } = options;
  const root = host.root.current,
    viewport = host.viewport.current;
  if (!root || !viewport) return () => {};
  owners.get(root)?.dispose();
  const epoch = ++nextEpoch;
  const proxy = root.ownerDocument.createElement("div");
  proxy.hidden = true;
  proxy.setAttribute("aria-hidden", "true");
  proxy.dataset.timelineDropTarget = "true";
  Object.assign(proxy.style, {
    position: "absolute",
    left: "0",
    pointerEvents: "auto",
    zIndex: "4",
    background: "transparent",
  });
  root.append(proxy);
  root.dataset.timelineDropTargetEpoch = String(epoch);
  const html = root.ownerDocument.documentElement;
  let disposed = false;
  let point: { x: number; y: number } | null = null;
  let lastEvent: Event | null = null;
  const hide = () => {
    proxy.hidden = true;
    delete proxy.dataset.layerDropId;
    delete proxy.dataset.layerDropPageId;
    delete proxy.dataset.layerDropKind;
    delete proxy.dataset.timelineRowIndex;
    delete proxy.dataset.motionRowKey;
  };
  const current = () =>
    !disposed &&
    owners.get(root)?.epoch === epoch &&
    host.root.current === root &&
    host.viewport.current === viewport &&
    root.isConnected;
  const sync = () => {
    if (!current() || html.dataset.layerReorderActive !== "true" || !point) {
      hide();
      return;
    }
    const bounds = root.getBoundingClientRect();
    if (
      point.x < bounds.left ||
      point.x >= bounds.right ||
      point.y < bounds.top ||
      point.y >= bounds.bottom
    ) {
      hide();
      return;
    }
    const model = host.readModel();
    if (!Number.isFinite(model.rowHeight) || model.rowHeight <= 0) {
      hide();
      return;
    }
    const documentY = point.y - bounds.top + viewport.scrollTop;
    const poses = getTimelineCanvasRowPositions(root);
    let index = Math.floor(documentY / model.rowHeight);
    let top = index * model.rowHeight,
      height = model.rowHeight;
    if (poses?.size) {
      const byKey = indexesFor(model.rows);
      let highest = -Infinity,
        last = -Infinity;
      index = -1;
      for (const [key, pose] of poses) {
        const at = byKey.get(key);
        if (at === undefined || documentY < pose.top || documentY >= pose.top + pose.height)
          continue;
        if (pose.zIndex < highest || (pose.zIndex === highest && pose.order <= last)) continue;
        index = at;
        top = pose.top;
        height = pose.height;
        highest = pose.zIndex;
        last = pose.order;
      }
    }
    const row = model.rows[index];
    if (!row) {
      hide();
      return;
    }
    proxy.dataset.layerDropId = row.layer.id;
    proxy.dataset.layerDropPageId = compositionId;
    proxy.dataset.layerDropKind = row.kind;
    proxy.dataset.timelineRowIndex = String(index);
    proxy.dataset.motionRowKey = row.key;
    proxy.style.top = `${top - viewport.scrollTop}px`;
    proxy.style.width = `${bounds.width}px`;
    proxy.style.height = `${height}px`;
    proxy.hidden = false;
  };
  const sample = (event: PointerEvent | DragEvent) => {
    if (lastEvent === event || !current()) return;
    lastEvent = event;
    point = { x: event.clientX, y: event.clientY };
    sync();
  };
  const observer = new MutationObserver(sync);
  observer.observe(html, { attributes: true, attributeFilter: ["data-layer-reorder-active"] });
  viewport.addEventListener("pointermove", sample, true);
  root.addEventListener("pointermove", sample, true);
  viewport.addEventListener("dragover", sample, true);
  root.addEventListener("dragover", sample, true);
  viewport.addEventListener("scroll", sync, { passive: true });
  const poseChanged = () => {
    if (current()) {
      sync();
      options.onPoseChange?.();
    }
  };
  root.addEventListener(TIMELINE_ROW_POSITIONS_EVENT, poseChanged);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    viewport.removeEventListener("pointermove", sample, true);
    root.removeEventListener("pointermove", sample, true);
    viewport.removeEventListener("dragover", sample, true);
    root.removeEventListener("dragover", sample, true);
    viewport.removeEventListener("scroll", sync);
    root.removeEventListener(TIMELINE_ROW_POSITIONS_EVENT, poseChanged);
    proxy.remove();
    point = null;
    lastEvent = null;
    if (owners.get(root)?.epoch === epoch) {
      owners.delete(root);
      delete root.dataset.timelineDropTargetEpoch;
    }
  };
  owners.set(root, { epoch, dispose });
  return dispose;
}
