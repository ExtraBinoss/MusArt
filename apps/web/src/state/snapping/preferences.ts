import { atom } from "jotai";

export interface SnappingPreferences {
  enabled: boolean;
  threshold: number;
}
export const DEFAULT_SNAPPING: Readonly<SnappingPreferences> = Object.freeze({
  enabled: true,
  threshold: 6,
});
export const SNAPPING_STORAGE_KEY = "musart.snapping.v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function validateSnappingPreferences(value: unknown): Readonly<SnappingPreferences> {
  if (
    !value ||
    typeof value !== "object" ||
    !("enabled" in value) ||
    typeof value.enabled !== "boolean" ||
    !("threshold" in value) ||
    typeof value.threshold !== "number" ||
    !Number.isFinite(value.threshold) ||
    value.threshold < 1 ||
    value.threshold > 24
  )
    throw new RangeError(
      "Snapping requires an enabled flag and a threshold from 1 to 24 CSS pixels.",
    );
  return Object.freeze({ enabled: value.enabled, threshold: value.threshold });
}

/** Small editor preferences; no document IDs, undo entries or per-pointer storage reads. */
export class SnappingPreferenceStore {
  private snapshot: Readonly<SnappingPreferences>;
  private volatile = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly storage: () => PreferenceStorage = () => localStorage,
    private readonly events: EventTarget | undefined = typeof window === "undefined"
      ? undefined
      : window,
  ) {
    this.snapshot = this.load();
  }
  private load(fallback = DEFAULT_SNAPPING): Readonly<SnappingPreferences> {
    try {
      const raw = this.storage().getItem(SNAPPING_STORAGE_KEY);
      if (!raw) return DEFAULT_SNAPPING;
      if (raw.length > 256) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1)
        return fallback;
      return validateSnappingPreferences(parsed);
    } catch {
      return fallback;
    }
  }
  private publish(next: Readonly<SnappingPreferences>): void {
    if (next.enabled === this.snapshot.enabled && next.threshold === this.snapshot.threshold)
      return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private external = (event: Event): void => {
    const key = (event as StorageEvent).key;
    if (key === null || key === SNAPPING_STORAGE_KEY) this.publish(this.load(this.snapshot));
  };
  read = (): Readonly<SnappingPreferences> => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
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
  update = (patch: Partial<SnappingPreferences>): Readonly<SnappingPreferences> => {
    const next = validateSnappingPreferences({ ...this.snapshot, ...patch });
    try {
      this.storage().setItem(SNAPPING_STORAGE_KEY, JSON.stringify({ version: 1, ...next }));
      this.volatile = false;
    } catch {
      this.volatile = true;
    }
    this.publish(next);
    return this.snapshot;
  };
  reset = (): Readonly<SnappingPreferences> => this.update(DEFAULT_SNAPPING);
}
export const snappingPreferences = new SnappingPreferenceStore();
const valueAtom = atom(snappingPreferences.read());
valueAtom.onMount = (set) => {
  const stop = snappingPreferences.subscribe(() => set(snappingPreferences.read()));
  set(snappingPreferences.read());
  return stop;
};
export const snappingAtom = atom(
  (get) => get(valueAtom),
  (_get, set, patch: Partial<SnappingPreferences>) =>
    set(valueAtom, snappingPreferences.update(patch)),
);
