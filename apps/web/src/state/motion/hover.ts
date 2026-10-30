import { createLayerGeometryIndex, type CommandCommitInfo, type EnginePort } from "@musart/core";

export interface TimelineHoverTarget {
  readonly projectId: string;
  readonly compositionId: string;
  readonly layerId: string;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}
const sources = new WeakMap<EnginePort, TimelineHoverSource>();

/** One ephemeral hover lease per editor. Neither canonical selection nor history is mutated. */
export class TimelineHoverSource {
  private target: TimelineHoverTarget | null = null;
  private token: symbol | null = null;
  private readonly listeners = new Set<() => void>();
  private stop: (() => void) | null = null;
  private stopSummary: (() => void) | null = null;
  constructor(private readonly engine: EnginePort) {}
  read = () => this.target;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    for (const listener of this.listeners) listener();
  }
  private clear(token: symbol) {
    if (this.token !== token) return;
    this.target = null;
    this.token = null;
    this.stop?.();
    this.stopSummary?.();
    this.stop = this.stopSummary = null;
    this.publish();
  }
  show(compositionId: string, layerId: string): () => void {
    const snapshot = this.engine.getSnapshot();
    const page = snapshot.project.pages.find((item) => item.id === compositionId);
    if (
      snapshot.pageId !== compositionId ||
      !page ||
      !createLayerGeometryIndex(page).byId.has(layerId)
    )
      return () => {};
    const previous = this.target;
    const projectId = snapshot.project.id;
    const token = Symbol("timeline-hover");
    this.token = token;
    this.target = Object.freeze({ projectId, compositionId, layerId });
    this.stop?.();
    this.stopSummary?.();
    let project = snapshot.project;
    const summarized =
      "subscribeCommitInfo" in this.engine && typeof this.engine.subscribeCommitInfo === "function";
    this.stop = this.engine.subscribe(() => {
      const current = this.engine.getSnapshot();
      const active = current.project.pages.find((item) => item.id === compositionId);
      if (
        current.project.id !== projectId ||
        current.pageId !== compositionId ||
        !active ||
        !createLayerGeometryIndex(active).byId.has(layerId) ||
        (!summarized && current.project !== project && !current.canUndo && !current.canRedo)
      ) {
        this.clear(token);
      } else project = current.project;
    });
    this.stopSummary = null;
    if (summarized)
      this.stopSummary = (this.engine as SummaryEngine).subscribeCommitInfo((event) => {
        if (event.kind === "load") this.clear(token);
      });
    if (
      !previous ||
      previous.projectId !== this.target.projectId ||
      previous.compositionId !== compositionId ||
      previous.layerId !== layerId
    )
      this.publish();
    return () => this.clear(token);
  }
}

export function createTimelineHoverSource(engine: EnginePort): TimelineHoverSource {
  let source = sources.get(engine);
  if (!source) {
    source = new TimelineHoverSource(engine);
    sources.set(engine, source);
  }
  return source;
}
