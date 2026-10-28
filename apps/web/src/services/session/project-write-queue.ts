import type { Project } from "@musart/core";
import { snapshotProject } from "../projects/writes/snapshot";

/** One editor writer; accepted immutable snapshots persist FIFO without weakening durable CAS. */
export class ProjectWriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private closed = false;
  private disposal: Promise<void> | null = null;
  constructor(private readonly persist: (project: Project) => Promise<void>) {}

  save = (project: Project): Promise<void> => {
    if (this.closed) return Promise.reject(new Error("Project writer is disposed."));
    if (this.pending >= 128) return Promise.reject(new Error("Project write queue is full."));
    let snapshot: Project;
    try {
      // Capture before the first asynchronous boundary, including while another write is active.
      snapshot = snapshotProject(project);
    } catch (error) {
      return Promise.reject(error);
    }
    this.pending++;
    const operation = this.tail
      .catch(() => undefined)
      .then(() => this.persist(snapshot))
      .finally(() => {
        this.pending--;
      });
    this.tail = operation;
    // Observe internally without changing the original rejection returned to the caller/flush.
    void operation.catch(() => undefined);
    return operation;
  };
  flush = (): Promise<void> => this.tail;
  dispose = (): Promise<void> => {
    this.closed = true;
    return (this.disposal ??= this.tail);
  };
}
