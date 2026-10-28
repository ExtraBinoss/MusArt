import {
  bindingSnapshot,
  KeybindingError,
  KEYBINDINGS_STORAGE_KEY,
  readBindings,
  serializeBindings,
} from "./preferences";
import type { BindingSnapshot, CommandId, KeyChord } from "./model";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export class KeybindingStore {
  private snapshot: BindingSnapshot;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly storage: () => StoragePort = () => localStorage,
    private readonly events: EventTarget = window,
  ) {
    this.snapshot = this.read();
  }
  private read() {
    try {
      return readBindings(this.storage().getItem(KEYBINDINGS_STORAGE_KEY));
    } catch {
      return bindingSnapshot();
    }
  }
  private publish(next: BindingSnapshot) {
    if (serializeBindings(next) === serializeBindings(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private external = (event: Event) => {
    const change = event as StorageEvent;
    if (change.key !== null && change.key !== KEYBINDINGS_STORAGE_KEY) return;
    this.publish(this.read());
  };
  readSnapshot = (): BindingSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (!this.listeners.size) {
      this.publish(this.read());
      this.events.addEventListener("storage", this.external);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.events.removeEventListener("storage", this.external);
    };
  };
  private commit(next: BindingSnapshot) {
    try {
      this.storage().setItem(KEYBINDINGS_STORAGE_KEY, serializeBindings(next));
    } catch {
      throw new KeybindingError("storage");
    }
    this.publish(next);
  }
  assign(id: CommandId, values: readonly KeyChord[]) {
    this.commit(bindingSnapshot({ ...this.read().overrides, [id]: values }, id));
  }
  reset(id?: CommandId) {
    const overrides = { ...this.read().overrides };
    if (id) delete overrides[id];
    this.commit(bindingSnapshot(id ? overrides : {}, id));
  }
}
export const keybindings = new KeybindingStore();
