export interface GpuResource {
  readonly bytes: number;
  readonly targets: number;
  dispose(): void;
}
interface Entry {
  resource: GpuResource;
  bytes: number;
}

/** LRU for owned GPU allocations. All resources referenced by this frame are pinned. */
export class GpuResourceCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pinned = new Set<string>();
  private usedBytes = 0;
  private externalBytes = 0;
  private readonly external = new Map<string, number>();
  constructor(readonly maxBytes = 384 * 1024 * 1024) {}

  beginFrame(retain?: string): void {
    this.pinned.clear();
    if (retain) this.pinned.add(retain);
  }
  get<T extends GpuResource>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.pinned.add(key);
    return entry.resource as T;
  }
  set(key: string, resource: GpuResource): void {
    const old = this.entries.get(key);
    const required = this.usedBytes - (old?.bytes ?? 0) + resource.bytes + this.externalBytes;
    try {
      this.makeRoom(required, key);
    } catch (error) {
      resource.dispose();
      if (old?.resource === resource) {
        this.entries.delete(key);
        this.usedBytes -= old.bytes;
      }
      throw error;
    }
    if (old && old.resource !== resource) old.resource.dispose();
    this.usedBytes -= old?.bytes ?? 0;
    this.entries.delete(key);
    this.entries.set(key, { resource, bytes: resource.bytes });
    this.usedBytes += resource.bytes;
    this.pinned.add(key);
  }
  ensureCapacity(key: string, bytes: number): void {
    this.makeRoom(
      this.usedBytes - (this.entries.get(key)?.bytes ?? 0) + bytes + this.externalBytes,
      key,
    );
  }
  /** In-flight texture owners remain non-evictable until their native GPU acknowledgement. */
  reserveExternal(key: string, bytes: number): void {
    if (!key || !Number.isSafeInteger(bytes) || bytes < 0)
      throw new RangeError("Invalid external GPU reservation.");
    const next = this.externalBytes - (this.external.get(key) ?? 0) + bytes;
    this.makeRoom(this.usedBytes + next, "");
    if (bytes) this.external.set(key, bytes);
    else this.external.delete(key);
    this.externalBytes = next;
  }
  synchronize(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.set(key, entry.resource);
  }
  private makeRoom(required: number, protectedKey: string): void {
    let needed = required;
    for (const [key, entry] of this.entries) {
      if (needed <= this.maxBytes) break;
      if (key === protectedKey || this.pinned.has(key)) continue;
      this.entries.delete(key);
      this.usedBytes -= entry.bytes;
      needed -= entry.bytes;
      entry.resource.dispose();
    }
    if (needed > this.maxBytes)
      throw new Error("Budget mémoire GPU dépassé. Réduisez les dimensions ou le nombre d’images.");
  }
  stats() {
    return {
      cacheBytes: this.usedBytes + this.externalBytes,
      targets: [...this.entries.values()].reduce((sum, entry) => sum + entry.resource.targets, 0),
      entries: this.entries.size,
      maxBytes: this.maxBytes,
    };
  }
  clear(): void {
    if (this.externalBytes) throw new Error("GPU resources still have active external owners.");
    for (const { resource } of this.entries.values()) resource.dispose();
    this.entries.clear();
    this.pinned.clear();
    this.usedBytes = 0;
  }
}
