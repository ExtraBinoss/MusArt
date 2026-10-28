import type { FragmentPart, FragmentPath } from "./model";
import { ARRAY_CHUNK_ITEMS, STRING_CHUNK_CHARS } from "./encode";
const MAX_FRAME_BYTES = 128 * 1024 * 1024;

/** One admitted frame; payload counters include keys/components and string chunks. */
export class FragmentAssembly {
  private root: unknown;
  private initialized = false;
  private bytes = 0;
  private readonly strings = new Map<
    string,
    { total: number; received: number; parts: string[] }
  >();
  private readonly arrays = new Map<string, { total: number; received: number }>();
  private account(value: unknown) {
    this.bytes += 16;
    if (typeof value === "string") this.bytes += value.length * 2;
    else if (value && typeof value === "object")
      for (const key of Object.keys(value)) {
        this.bytes += key.length * 2;
        this.account((value as Record<string, unknown>)[key]);
      }
    if (this.bytes > MAX_FRAME_BYTES) throw new Error("Fragmented value exceeds its input budget.");
  }
  private at(path: FragmentPath): unknown {
    if (path.length > 128) throw new Error("Fragment path is too deep.");
    let value = this.root;
    for (const key of path) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
        throw new Error("Invalid fragment path.");
      value = (value as Record<string | number, unknown>)[key];
    }
    return value;
  }
  add(part: FragmentPart) {
    if (part.type === "base") {
      if (this.initialized) throw new Error("Duplicate fragment base.");
      this.account(part.value);
      this.root = part.value;
      this.initialized = true;
      return;
    }
    if (
      !this.initialized ||
      !Number.isSafeInteger(part.offset) ||
      !Number.isSafeInteger(part.total) ||
      part.offset < 0 ||
      part.total <= 0
    )
      throw new Error("Invalid fragment order.");
    const key = JSON.stringify(part.path);
    if (part.type === "array") {
      const target = this.at(part.path),
        state = this.arrays.get(key) ?? { total: part.total, received: 0 };
      if (
        !Array.isArray(target) ||
        !Array.isArray(part.value) ||
        !part.value.length ||
        part.value.length > ARRAY_CHUNK_ITEMS ||
        state.total !== part.total ||
        state.received !== part.offset ||
        target.length !== part.offset ||
        part.offset + part.value.length > part.total
      )
        throw new Error("Invalid array fragment.");
      this.account(part.value);
      target.push(...part.value);
      state.received += part.value.length;
      if (state.received === state.total) this.arrays.delete(key);
      else this.arrays.set(key, state);
    } else {
      const state = this.strings.get(key) ?? { total: part.total, received: 0, parts: [] };
      if (
        this.at(part.path) !== "" ||
        typeof part.value !== "string" ||
        !part.value.length ||
        part.value.length > STRING_CHUNK_CHARS ||
        state.total !== part.total ||
        state.received !== part.offset ||
        part.offset + part.value.length > part.total
      )
        throw new Error("Invalid string fragment.");
      this.account(part.value);
      state.parts.push(part.value);
      state.received += part.value.length;
      if (state.received === state.total) {
        const parent = this.at(part.path.slice(0, -1)) as Record<string | number, unknown>,
          field = part.path.at(-1)!;
        Object.defineProperty(parent, field, {
          value: state.parts.join(""),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        this.strings.delete(key);
      } else this.strings.set(key, state);
    }
  }
  finish(): unknown {
    if (
      !this.initialized ||
      this.strings.size ||
      this.arrays.size ||
      !this.root ||
      typeof this.root !== "object"
    )
      throw new Error("Fragmented value is incomplete.");
    return this.root;
  }
}
