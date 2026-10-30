import type {
  BankOwner,
  BankPlayback,
  BankPort,
  BankShapeData,
} from "../../../services/motion/audio/bank/model";
export interface SfxPreviewState {
  readonly owner: BankOwner;
  readonly id: string | null;
  readonly playback?: BankPlayback;
  readonly status: "idle" | "preparing" | "ready" | "blocked" | "error";
  readonly error?: string;
}

/** Finite owner-scoped previews; native clock consumers subscribe without parent React state. */
export function createSfxPreview(port: BankPort, data: BankShapeData, delay = 35) {
  let owner: BankOwner | null = null,
    viewOpen = false,
    timer: ReturnType<typeof setTimeout> | null = null,
    generation = 0,
    suppressedUntil = 0;
  let state: SfxPreviewState | null = null;
  const listeners = new Set<(state: SfxPreviewState) => void>();
  const emit = (value: SfxPreviewState) => {
    state = value;
    for (const listener of listeners) listener(value);
  };
  function stop(held: BankOwner) {
    if (held !== owner) return;
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (state?.playback) port.stop(held, state.playback);
    emit({ owner: held, id: null, status: "idle" });
  }
  function warm() {
    if (!owner) owner = { kind: "sound-bank", token: Symbol("sound-bank") };
    port.open(owner, data);
    return owner;
  }
  function start(held: BankOwner, id: string, interactive: boolean) {
    if (held !== owner) return;
    stop(held);
    const playback: BankPlayback = { kind: "bank-playback", token: Symbol(id) },
      current = ++generation;
    emit({ owner: held, id, playback, status: "preparing" });
    let task: Promise<void>;
    try {
      task = port.preview(held, playback, id, interactive);
    } catch (error) {
      task = Promise.reject(error);
    }
    void task.then(
      () => {
        if (held === owner && current === generation)
          emit({ owner: held, id, playback, status: "ready" });
      },
      (error: unknown) => {
        if (held !== owner || current !== generation) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        port.stop(held, playback);
        emit({
          owner: held,
          id,
          playback,
          status:
            error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error",
          error: error instanceof Error ? error.message : "",
        });
      },
    );
  }
  return {
    warm,
    open() {
      viewOpen = true;
      return warm();
    },
    close(held: BankOwner) {
      if (owner !== held) return;
      stop(held);
      owner = null;
      viewOpen = false;
      port.close(held);
    },
    closeIntent() {
      if (owner && !viewOpen) {
        const held = owner;
        stop(held);
        owner = null;
        port.close(held);
      }
    },
    stop,
    hover(held: BankOwner, id: string, focus = false) {
      if (held !== owner || (!focus && performance.now() < suppressedUntil) || state?.id === id)
        return;
      stop(held);
      const playback: BankPlayback = { kind: "bank-playback", token: Symbol(id) };
      emit({ owner: held, id, playback, status: "preparing" });
      timer = setTimeout(() => {
        timer = null;
        start(held, id, false);
      }, delay);
    },
    play(held: BankOwner, id: string) {
      start(held, id, true);
    },
    leave(held: BankOwner, id: string) {
      if (held === owner && state?.id === id) stop(held);
    },
    scroll(held: BankOwner) {
      if (held !== owner) return;
      suppressedUntil = performance.now() + 100;
      stop(held);
    },
    subscribe(listener: (state: SfxPreviewState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read: () => state,
  };
}
