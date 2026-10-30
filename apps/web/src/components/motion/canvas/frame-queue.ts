/**
 * Architectural reference: Beam packages/runtime/src/timeline/frame-queue.ts (MPL-2.0).
 * This independent implementation uses cancellable phase sets; it has no Beam/Vue dependency.
 */
export interface TimelineCanvasFrameHost {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}
export function createTimelineCanvasFrameQueue(host: TimelineCanvasFrameHost) {
  const reads = new Set<() => void>(),
    writes = new Set<() => void>();
  let pending: number | null = null,
    disposed = false,
    flushing = false;
  const flush = () => {
    pending = null;
    flushing = true;
    const errors: unknown[] = [];
    for (const phase of [reads, writes]) {
      // Snapshot this phase: a paint invalidating itself belongs to the next frame.
      const batch = Array.from(phase);
      for (const callback of batch) {
        if (!phase.delete(callback)) continue;
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    flushing = false;
    schedule();
    if (errors.length) throw new AggregateError(errors, "Timeline canvas frame failed.");
  };
  const schedule = () => {
    if (!disposed && !flushing && pending === null && (reads.size || writes.size))
      pending = host.request(flush);
  };
  return {
    request(phase: "measure" | "paint", callback: () => void) {
      if (disposed) return () => {};
      const queue = phase === "measure" ? reads : writes;
      queue.add(callback);
      schedule();
      return () => {
        queue.delete(callback);
        if (!reads.size && !writes.size && pending !== null) {
          host.cancel(pending);
          pending = null;
        }
      };
    },
    dispose() {
      disposed = true;
      if (pending !== null) host.cancel(pending);
      pending = null;
      reads.clear();
      writes.clear();
    },
  };
}
