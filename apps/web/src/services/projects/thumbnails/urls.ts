import type { StoredThumbnail, ThumbnailLease, ThumbnailView } from "./model";
interface Entry {
  record: StoredThumbnail;
  url: string;
  users: number;
  stale: boolean;
  tick: number;
}
/** Object URLs remain alive until every visible card lease releases them. */
export class ThumbnailUrls {
  private readonly entries = new Map<string, Entry>();
  private tick = 0;
  private closed = false;
  constructor(
    private readonly maxEntries = 80,
    private readonly maxBytes = 32 * 1024 * 1024,
  ) {}
  acquire(records: readonly StoredThumbnail[]): ThumbnailLease {
    if (this.closed) throw new Error("Thumbnail URL cache is closed.");
    const held: Entry[] = [],
      items: ThumbnailView[] = [];
    for (const record of records) {
      const key = JSON.stringify([record.projectId, record.pageId, record.revision]);
      let entry = this.entries.get(key);
      if (!entry) {
        entry = { record, url: URL.createObjectURL(record.blob), users: 0, stale: false, tick: 0 };
        this.entries.set(key, entry);
      }
      entry.users++;
      entry.tick = ++this.tick;
      held.push(entry);
      items.push({
        pageId: record.pageId,
        revision: record.revision,
        url: entry.url,
        width: record.width,
        height: record.height,
      });
    }
    this.trim();
    let released = false;
    return {
      items,
      release: () => {
        if (released) return;
        released = true;
        for (const entry of held) entry.users--;
        this.trim();
      },
    };
  }
  invalidate(projectId: string, pageId?: string, revision?: string): void {
    for (const entry of this.entries.values())
      if (
        entry.record.projectId === projectId &&
        (!pageId || entry.record.pageId === pageId) &&
        entry.record.revision !== revision
      )
        entry.stale = true;
    this.trim();
  }
  private trim() {
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.record.blob.size, 0);
    for (const [key, entry] of [...this.entries].sort(([, a], [, b]) => a.tick - b.tick)) {
      if (entry.users > 0) continue;
      if (!entry.stale && this.entries.size <= this.maxEntries && bytes <= this.maxBytes) continue;
      URL.revokeObjectURL(entry.url);
      this.entries.delete(key);
      bytes -= entry.record.blob.size;
    }
  }
  stats() {
    return {
      entries: this.entries.size,
      bytes: [...this.entries.values()].reduce((sum, entry) => sum + entry.record.blob.size, 0),
      leases: [...this.entries.values()].reduce((sum, entry) => sum + entry.users, 0),
    };
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url);
    this.entries.clear();
  }
}
