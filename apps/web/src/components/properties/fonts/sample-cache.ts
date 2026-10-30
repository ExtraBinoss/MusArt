import { FONT_CATALOG, type FontDefinition } from "@musart/assets";
import type { FontLibraryPort } from "../../../services/fonts/model";
import { downloadFont } from "../../../services/fonts/download";

export interface FontSampleState {
  readonly status: "loading" | "ready" | "error";
  readonly family?: string;
}
interface Entry {
  font: FontDefinition;
  installed: boolean;
  state: FontSampleState;
  listeners: Set<(state: FontSampleState) => void>;
  controller: AbortController;
  face?: FontFace;
  bytes: number;
  touched: number;
  cancelled: boolean;
}
export const FONT_SAMPLE_LIMITS = {
  faces: 8,
  bytes: 24 * 1024 * 1024,
  fileBytes: 4 * 1024 * 1024,
  concurrency: 2,
} as const;
const LOADING: FontSampleState = Object.freeze({ status: "loading" });
const ERROR: FontSampleState = Object.freeze({ status: "error" });
let familySequence = 0;
const cssString = (value: string) =>
  `"${value.replace(/["\\\n\r\f]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `)}"`;

/** Ephemeral browser faces for visible UI samples; never installs or persists catalog originals. */
export class FontSampleCache {
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Entry[] = [];
  private running = 0;
  private clock = 0;
  private bytes = 0;
  private paused = true;
  private disposed = false;
  constructor(private readonly library: FontLibraryPort) {}
  resume(): void {
    if (!this.disposed) {
      this.paused = false;
      this.pump();
    }
  }
  acquire(
    font: FontDefinition,
    installed: boolean,
    listener: (state: FontSampleState) => void,
  ): () => void {
    if (this.disposed) {
      listener(ERROR);
      return () => undefined;
    }
    let entry = this.entries.get(font.id);
    if (!entry) {
      entry = {
        font,
        installed,
        state: LOADING,
        listeners: new Set(),
        controller: new AbortController(),
        bytes: 0,
        touched: ++this.clock,
        cancelled: false,
      };
      this.entries.set(font.id, entry);
      this.queue.push(entry);
    }
    const current = entry;
    current.touched = ++this.clock;
    current.listeners.add(listener);
    listener(current.state);
    this.pump();
    return () => {
      current.listeners.delete(listener);
      if (!current.listeners.size && current.state.status !== "ready") this.remove(current);
      this.trim(0);
    };
  }
  private publish(entry: Entry, state: FontSampleState): void {
    if (entry.cancelled || this.disposed) return;
    entry.state = state;
    for (const listener of entry.listeners) listener(state);
  }
  private remove(entry: Entry): void {
    if (entry.cancelled) return;
    entry.cancelled = true;
    entry.controller.abort();
    if (entry.face) document.fonts.delete(entry.face);
    this.bytes -= entry.bytes;
    if (this.entries.get(entry.font.id) === entry) this.entries.delete(entry.font.id);
    const at = this.queue.indexOf(entry);
    if (at >= 0) this.queue.splice(at, 1);
  }
  private trim(incoming: number, adding = false): boolean {
    const idle = [...this.entries.values()]
      .filter((entry) => entry.face && !entry.listeners.size)
      .sort((a, b) => a.touched - b.touched);
    const faces = () => [...this.entries.values()].filter((entry) => entry.face).length;
    while (
      idle.length &&
      (this.bytes + incoming > FONT_SAMPLE_LIMITS.bytes ||
        faces() + Number(adding) > FONT_SAMPLE_LIMITS.faces)
    )
      this.remove(idle.shift()!);
    return (
      this.bytes + incoming <= FONT_SAMPLE_LIMITS.bytes &&
      faces() + Number(adding) <= FONT_SAMPLE_LIMITS.faces
    );
  }
  private async source(entry: Entry): Promise<{ source: string | ArrayBuffer; bytes: number }> {
    const { font, controller } = entry;
    if (font.source === "local" && font.family.startsWith("local:"))
      return { source: `local(${cssString(font.family.slice(6))})`, bytes: 0 };
    const bundled = FONT_CATALOG.find((item) => item.id === font.id);
    if (!bundled && font.family.startsWith("custom:") && entry.installed) {
      const source = await this.library.resolve(font.family, 400, controller.signal);
      if (source.byteLength > FONT_SAMPLE_LIMITS.fileBytes)
        throw new Error("Font sample exceeds its byte budget.");
      return { source, bytes: source.byteLength };
    }
    const variants = font.variants?.filter((variant) => variant.style === "normal");
    const variant = [...(variants?.length ? variants : (font.variants ?? []))].sort(
      (a, b) => Math.abs(a.weight - 400) - Math.abs(b.weight - 400),
    )[0];
    const url = bundled ? `${import.meta.env.BASE_URL}fonts/${bundled.id}/font.ttf` : variant?.url;
    if (!url || (variant?.bytes ?? 0) > FONT_SAMPLE_LIMITS.fileBytes)
      throw new Error("No bounded sample source is available.");
    const source = await downloadFont(
      url,
      globalThis.fetch.bind(globalThis),
      controller.signal,
      FONT_SAMPLE_LIMITS.fileBytes,
    );
    return { source, bytes: source.byteLength };
  }
  private async load(entry: Entry, controller: AbortController): Promise<void> {
    if (typeof FontFace !== "function" || !document.fonts?.add) {
      this.publish(entry, ERROR);
      return;
    }
    const { source, bytes } = await this.source(entry);
    controller.signal.throwIfAborted();
    const family = `MusArtFontSample${++familySequence}`;
    const face = await new FontFace(family, source).load();
    controller.signal.throwIfAborted();
    if (this.disposed || this.paused || entry.cancelled || !entry.listeners.size) return;
    if (face.status !== "loaded" || !this.trim(bytes, true))
      throw new Error("Font sample cache is full.");
    entry.face = face;
    entry.bytes = bytes;
    this.bytes += bytes;
    document.fonts.add(face);
    this.publish(entry, Object.freeze({ status: "ready", family }));
  }
  private pump(): void {
    while (
      !this.disposed &&
      !this.paused &&
      this.running < FONT_SAMPLE_LIMITS.concurrency &&
      this.queue.length
    ) {
      const entry = this.queue.shift()!;
      if (entry.cancelled || !entry.listeners.size) continue;
      this.running++;
      const controller = entry.controller;
      void this.load(entry, controller)
        .catch(() => {
          if (entry.controller === controller && !controller.signal.aborted)
            this.publish(entry, ERROR);
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
  pause(): void {
    this.paused = true;
    for (const entry of this.entries.values())
      if (entry.state.status === "loading") {
        entry.controller.abort();
        if (!entry.listeners.size) this.remove(entry);
        else {
          entry.controller = new AbortController();
          if (!this.queue.includes(entry)) this.queue.push(entry);
        }
      }
  }
  dispose(): void {
    this.disposed = true;
    this.paused = true;
    for (const entry of this.entries.values()) this.remove(entry);
    this.queue.length = 0;
  }
}
