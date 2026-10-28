import type { Vector4 } from "three/webgpu";
import { parseColor } from "../nodes/color";

/** Bounded decoded paint values; payload bytes count UTF-16 keys and four float64 components. */
export class PrimitivePaintCache {
  private readonly colors = new Map<string, Readonly<Vector4>>();
  private payloadBytes = 0;
  constructor(
    private readonly maxEntries = 128,
    private readonly maxBytes = 16 * 1024,
  ) {
    if (
      !Number.isInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isInteger(maxBytes) ||
      maxBytes < 1
    )
      throw new Error("Invalid primitive paint cache budget.");
  }
  get size(): number {
    return this.colors.size;
  }
  get bytes(): number {
    return this.payloadBytes;
  }
  read(value: string): Readonly<Vector4> {
    const cached = this.colors.get(value);
    if (cached) {
      this.colors.delete(value);
      this.colors.set(value, cached);
      return cached;
    }
    // Parsing rejects invalid or oversized color strings before retaining a key.
    const color = Object.freeze(parseColor(value)),
      bytes = value.length * 2 + 32;
    if (bytes > this.maxBytes) return color;
    while (this.colors.size >= this.maxEntries || this.payloadBytes + bytes > this.maxBytes) {
      const oldest = this.colors.keys().next().value!;
      this.colors.delete(oldest);
      this.payloadBytes -= oldest.length * 2 + 32;
    }
    this.colors.set(value, color);
    this.payloadBytes += bytes;
    return color;
  }
  clear(): void {
    this.colors.clear();
    this.payloadBytes = 0;
  }
}
