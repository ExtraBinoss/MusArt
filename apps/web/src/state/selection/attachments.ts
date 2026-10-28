import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Project,
  type CommandCommitInfo,
} from "@musart/core";
export type AttachmentTarget =
  | { kind: "effect"; pageId: string; layerId: string; effectId: string }
  | { kind: "mask"; pageId: string; layerId: string };
interface Record {
  target: AttachmentTarget;
  project: WeakRef<Project>;
  page: WeakRef<Composition>;
  maskKey: string;
  loaded: boolean;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}
const ports = new WeakMap<EnginePort, AttachmentSelection>();
const maskKey = (page: Composition, id: string) => {
  const mask = createLayerGeometryIndex(page).byId.get(id)?.mask;
  return mask ? JSON.stringify([mask.assetId, mask.layerId]) : "";
};
/** Presentation targets never enter Engine.selection or portable documents. */
export class AttachmentSelection {
  private record: Record | null = null;
  private listeners = new Set<() => void>();
  private stop: (() => void) | null = null;
  private stopSummary: (() => void) | null = null;
  constructor(private readonly engine: EnginePort) {}
  read = () => this.record?.target ?? null;
  private publish() {
    for (const listener of this.listeners) listener();
  }
  private observe() {
    if (this.stop) return;
    this.stop = this.engine.subscribe(() => {
      if (!this.record) return;
      const snapshot = this.engine.getSnapshot();
      if (
        snapshot.pageId !== this.record.target.pageId ||
        snapshot.selection.length !== 1 ||
        snapshot.selection[0] !== this.record.target.layerId
      ) {
        this.clear();
        return;
      }
      // Keep invalid attachment intent until explicitly reselected: it must never become layer deletion.
      this.record.target = Object.freeze({ ...this.record.target });
      this.publish();
    });
    if (
      "subscribeCommitInfo" in this.engine &&
      typeof this.engine.subscribeCommitInfo === "function"
    )
      this.stopSummary = (this.engine as SummaryEngine).subscribeCommitInfo((event) => {
        const record = this.record;
        if (!record) return;
        if (event.kind === "load") record.loaded = true;
        if (record.loaded || event.snapshot !== this.engine.getSnapshot()) return;
        const page = event.snapshot.project.pages.find((item) => item.id === record.target.pageId);
        if (page && event.snapshot.project.id === record.project.deref()?.id) {
          record.project = new WeakRef(event.snapshot.project);
          record.page = new WeakRef(page);
          record.target = Object.freeze({ ...record.target });
          this.publish();
        }
      });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    this.observe();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.release();
    };
  };
  private release() {
    this.stop?.();
    this.stopSummary?.();
    this.stop = this.stopSummary = null;
  }
  clear = () => {
    if (!this.record) return;
    this.record = null;
    this.publish();
    if (!this.listeners.size) this.release();
  };
  select = (page: Composition, target: AttachmentTarget): boolean => {
    const initial = this.engine.getSnapshot();
    const block = () => {
      this.observe();
      this.record = {
        target: Object.freeze({ ...target }),
        project: new WeakRef(initial.project),
        page: new WeakRef(page),
        maskKey: "",
        loaded: true,
      };
      this.publish();
      return false;
    };
    const previous = this.read();
    if (
      previous?.kind === target.kind &&
      previous.pageId === target.pageId &&
      previous.layerId === target.layerId &&
      (previous.kind !== "effect" ||
        target.kind !== "effect" ||
        previous.effectId === target.effectId) &&
      this.editable()
    )
      return true;
    if (
      initial.project.pages.find((item) => item.id === page.id) !== page ||
      target.pageId !== page.id
    )
      return block();
    const layer = createLayerGeometryIndex(page).byId.get(target.layerId);
    if (
      !layer ||
      (target.kind === "effect"
        ? !layer.effects.some((effect) => effect.id === target.effectId)
        : !layer.mask)
    )
      return block();
    this.engine.setPage(page.id);
    this.engine.select([target.layerId]);
    const snapshot = this.engine.getSnapshot();
    if (
      snapshot.project !== initial.project ||
      snapshot.pageId !== page.id ||
      snapshot.project.pages.find((item) => item.id === page.id) !== page
    )
      return block();
    this.observe();
    this.record = {
      target: Object.freeze({ ...target }),
      project: new WeakRef(snapshot.project),
      page: new WeakRef(page),
      maskKey: maskKey(page, target.layerId),
      loaded: false,
    };
    this.publish();
    return true;
  };
  editable = (): boolean => {
    const record = this.record,
      snapshot = this.engine.getSnapshot();
    if (
      !record ||
      record.loaded ||
      record.project.deref() !== snapshot.project ||
      record.page.deref() !== snapshot.project.pages.find((item) => item.id === snapshot.pageId) ||
      snapshot.pageId !== record.target.pageId ||
      snapshot.selection.length !== 1 ||
      snapshot.selection[0] !== record.target.layerId
    )
      return false;
    const page = record.page.deref()!,
      target = record.target,
      index = createLayerGeometryIndex(page),
      layer = index.byId.get(target.layerId);
    return Boolean(
      layer &&
      !index.isLocked(layer.id) &&
      (target.kind === "effect"
        ? layer.effects.some((effect) => effect.id === target.effectId)
        : layer.mask && maskKey(page, layer.id) === record.maskKey),
    );
  };
}
export function attachmentSelection(engine: EnginePort) {
  let port = ports.get(engine);
  if (!port) {
    port = new AttachmentSelection(engine);
    ports.set(engine, port);
  }
  return port;
}
/** Capture the UI intent before a task adapter can defer execution. A stale attachment never falls back. */
export function capturePresentationDelete(engine: EnginePort): () => void {
  const origin = engine.getSnapshot(),
    port = attachmentSelection(engine),
    target = port.read(),
    ids = [...origin.selection];
  return () => {
    const snapshot = engine.getSnapshot();
    if (
      snapshot.project !== origin.project ||
      snapshot.pageId !== origin.pageId ||
      snapshot.revision !== origin.revision ||
      snapshot.selection.length !== ids.length ||
      ids.some((id, index) => snapshot.selection[index] !== id) ||
      port.read() !== target
    )
      return;
    if (target) {
      if (!port.editable()) return;
      const page = snapshot.project.pages.find((item) => item.id === target.pageId)!,
        layer = createLayerGeometryIndex(page).get(target.layerId);
      if (target.kind === "effect")
        engine.execute({
          type: "updateLayers",
          ids: [layer.id],
          patch: { effects: layer.effects.filter((effect) => effect.id !== target.effectId) },
        });
      else engine.execute({ type: "removeLayerMask", targetId: layer.id });
      port.clear();
      engine.select([]);
    } else if (ids.length) engine.execute({ type: "deleteLayers", ids });
  };
}
