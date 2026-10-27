/** Collision-free identities for flat source signatures; eviction only causes a safe cache miss. */
export class SourceIdentities {
  private readonly entries = new Map<string, string>();
  private bytes = 0;
  private sequence = 0n;
  constructor(
    private readonly maxEntries = 32768,
    private readonly maxBytes = 32 * 1024 * 1024,
  ) {
    if (
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1
    )
      throw new RangeError("Invalid source identity budget.");
  }
  intern(signature: string): string {
    const cached = this.entries.get(signature);
    if (cached !== undefined) {
      this.entries.delete(signature);
      this.entries.set(signature, cached);
      return cached;
    }
    const id = `source:${(++this.sequence).toString(36)}`;
    const bytes = (signature.length + id.length) * 2;
    if (bytes > this.maxBytes) return id;
    this.entries.set(signature, id);
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value!;
      this.entries.delete(oldest[0]);
      this.bytes -= (oldest[0].length + oldest[1].length) * 2;
    }
    return id;
  }
  stats() {
    return { entries: this.entries.size, bytes: this.bytes };
  }
}
