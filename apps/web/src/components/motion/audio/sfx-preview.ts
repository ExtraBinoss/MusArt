export interface SfxPreviewState {
  readonly id: string | null;
  readonly status: "idle" | "preparing" | "ready" | "blocked" | "error";
  readonly peaks?: Float32Array;
  readonly error?: string;
}
interface PreviewPort {
  previewPreset(id: string, interactive: boolean): Promise<void>;
  stopPreview(): void;
  preparation: { sfxWaveform(id: string): Promise<Float32Array> };
}

/** One delayed audition. Retired hover/focus work can neither play nor update its replacement. */
export function createSfxPreview(
  port: PreviewPort,
  notify: (state: SfxPreviewState) => void,
  delay = 150,
) {
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | null = null,
    active: string | null = null;
  const stop = (publish = true) => {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    active = null;
    port.stopPreview();
    if (publish) notify({ id: null, status: "idle" });
  };
  function start(id: string, interactive: boolean) {
    stop(false);
    active = id;
    const current = generation;
    let envelopeFailed = false;
    let state: SfxPreviewState = { id, status: "preparing" };
    notify(state);
    const update = (patch: Partial<SfxPreviewState>) => {
      if (current === generation) {
        state = { ...state, ...patch };
        notify(state);
      }
    };
    void port.preparation.sfxWaveform(id).then(
      (peaks) => update({ peaks }),
      (error: unknown) => {
        if (current === generation) {
          envelopeFailed = true;
          port.stopPreview();
          update({ status: "error", error: error instanceof Error ? error.message : "" });
        }
      },
    );
    let playback: Promise<void>;
    try {
      playback = port.previewPreset(id, interactive);
    } catch (error) {
      playback = Promise.reject(error);
    }
    void playback.then(
      () => {
        if (current === generation && !envelopeFailed) update({ status: "ready" });
      },
      (error: unknown) => {
        if (current !== generation) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        port.stopPreview();
        update({
          status:
            error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error",
          error: error instanceof Error ? error.message : "",
        });
      },
    );
  }
  return {
    hover(id: string) {
      if (active === id) return;
      stop(false);
      active = id;
      timer = setTimeout(() => {
        timer = null;
        start(id, false);
      }, delay);
    },
    play(id: string) {
      start(id, true);
    },
    leave(id: string) {
      if (active === id) stop();
    },
    stop,
  };
}
