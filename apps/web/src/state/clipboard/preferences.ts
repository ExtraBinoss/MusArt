import { atom } from "jotai";

export const CLIPBOARD_STORAGE_KEY = "musart.clipboard.v1";
export interface ClipboardPreferences {
  includeImages: boolean;
}
export const DEFAULT_CLIPBOARD: Readonly<ClipboardPreferences> = Object.freeze({
  includeImages: true,
});
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** A small platform preference, independent from project documents and undo history. */
export class ClipboardPreferenceStore {
  private snapshot: Readonly<ClipboardPreferences>;
  private readonly listeners = new Set<() => void>();
  private volatile = false;
  constructor(
    private readonly storage: () => PreferenceStorage = () => localStorage,
    private readonly events: EventTarget | undefined = typeof window === "undefined"
      ? undefined
      : window,
  ) {
    this.snapshot = this.load();
  }
  private load(fallback = DEFAULT_CLIPBOARD): Readonly<ClipboardPreferences> {
    try {
      const raw = this.storage().getItem(CLIPBOARD_STORAGE_KEY);
      if (!raw) return DEFAULT_CLIPBOARD;
      if (raw.length > 256) return fallback;
      const value: unknown = JSON.parse(raw);
      return value &&
        typeof value === "object" &&
        "version" in value &&
        value.version === 1 &&
        "includeImages" in value &&
        typeof value.includeImages === "boolean"
        ? Object.freeze({ includeImages: value.includeImages })
        : fallback;
    } catch {
      return fallback;
    }
  }
  private publish(value: Readonly<ClipboardPreferences>) {
    if (value.includeImages === this.snapshot.includeImages) return;
    this.snapshot = value;
    for (const listener of this.listeners) listener();
  }
  private external = (event: Event) => {
    if (
      (event as StorageEvent).key === null ||
      (event as StorageEvent).key === CLIPBOARD_STORAGE_KEY
    )
      this.publish(this.load(this.snapshot));
  };
  read = () => this.snapshot;
  subscribe = (listener: () => void) => {
    if (!this.listeners.size) {
      if (!this.volatile) this.publish(this.load(this.snapshot));
      this.events?.addEventListener("storage", this.external);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.events?.removeEventListener("storage", this.external);
    };
  };
  update = (includeImages: boolean) => {
    if (typeof includeImages !== "boolean")
      throw new TypeError("Invalid clipboard image preference.");
    const next = Object.freeze({ includeImages });
    try {
      this.storage().setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ version: 1, ...next }));
      this.volatile = false;
    } catch {
      this.volatile = true;
    }
    this.publish(next);
    return this.snapshot;
  };
}
export const clipboardPreferences = new ClipboardPreferenceStore();
const valueAtom = atom(clipboardPreferences.read());
valueAtom.onMount = (set) => {
  const stop = clipboardPreferences.subscribe(() => set(clipboardPreferences.read()));
  set(clipboardPreferences.read());
  return stop;
};
export const clipboardAtom = atom(
  (get) => get(valueAtom),
  (_get, set, includeImages: boolean) => set(valueAtom, clipboardPreferences.update(includeImages)),
);
