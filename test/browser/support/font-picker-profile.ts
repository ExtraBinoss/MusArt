import type { Page } from "@playwright/test";

interface RowGeometry {
  name: string;
  position: number;
  size: number;
  preview: string | null;
}
interface FontInputSample {
  value: string;
  generated: number;
  dispatch: number;
  echoAt?: number;
  finalAt?: number;
  superseded?: boolean;
}
interface FontProfile {
  opens: { generated: number; dispatch: number; first?: FrameGeometry; second?: FrameGeometry }[];
  inputs: FontInputSample[];
  wheels: {
    generated: number;
    dispatch: number;
    raf?: number;
    top?: number;
    rows?: RowGeometry[];
  }[];
  tasks: { start: number; duration: number }[];
  faces: { family: string; start: number; end?: number; status?: string }[];
  submits: number;
  adapter?: Record<string, string | boolean>;
  stop?: () => void;
}
interface FrameGeometry {
  at: number;
  present: boolean;
  top: number;
  rendered: number;
  firstRenderedPosition?: number;
  rows: RowGeometry[];
}
declare global {
  interface Window {
    __fontPickerProfile?: FontProfile;
  }
}

/** Native input/viewport observations only; document snapshots remain outside measured frames. */
export async function installFontPickerProfile(page: Page) {
  await page.addInitScript(() => {
    const state: FontProfile = {
      opens: [],
      inputs: [],
      wheels: [],
      tasks: [],
      faces: [],
      submits: 0,
    };
    window.__fontPickerProfile = state;
    const frames = new Set<number>();
    const raf = (callback: () => void) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        callback();
      });
      frames.add(id);
    };
    function geometry() {
      const list = document.querySelector<HTMLElement>('[role="listbox"][aria-label="Polices"]');
      if (!list)
        return {
          at: performance.now(),
          present: false,
          top: 0,
          rendered: 0,
          rows: [] as RowGeometry[],
        };
      const area = list.getBoundingClientRect();
      const rows = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
        .filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.height > 0 && rect.bottom > area.top && rect.top < area.bottom;
        })
        .map((row) => ({
          name: row.getAttribute("aria-label") ?? "",
          position: Number(row.getAttribute("aria-posinset")),
          size: Number(row.getAttribute("aria-setsize")),
          preview:
            row
              .querySelector("[data-font-preview-state]")
              ?.getAttribute("data-font-preview-state") ?? null,
        }));
      return {
        at: performance.now(),
        present: true,
        top: list.scrollTop,
        rendered: list.querySelectorAll('[role="option"]').length,
        firstRenderedPosition: Number(
          list.querySelector('[role="option"]')?.getAttribute("aria-posinset"),
        ),
        rows,
      };
    }
    let keyAt = 0;
    function key(event: KeyboardEvent) {
      keyAt = event.timeStamp;
    }
    function input(event: Event) {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) ||
        target.getAttribute("aria-label") !== "Rechercher une police" ||
        !target.value
      )
        return;
      const sample: FontInputSample = {
        value: target.value,
        generated: keyAt || event.timeStamp,
        dispatch: performance.now(),
      };
      state.inputs.push(sample);
      const observe = () => {
        if (target.value !== sample.value || !target.isConnected) {
          sample.superseded = true;
          return;
        }
        sample.echoAt ??= performance.now();
        if (["Raleway", "Tinos", "Pacifico"].includes(sample.value)) {
          const rows = geometry().rows;
          const expected =
            sample.value === "Raleway" ? ["Raleway", "Raleway Dots"] : [sample.value];
          if (
            rows.length === expected.length &&
            rows.every((row, index) => row.name === expected[index] && row.size === expected.length)
          )
            sample.finalAt = performance.now();
          else raf(observe);
        }
      };
      raf(observe);
    }
    function pointer(event: PointerEvent) {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[role="combobox"][aria-label="Police"]')
      )
        return;
      const sample: FontProfile["opens"][number] = {
        generated: event.timeStamp,
        dispatch: performance.now(),
      };
      state.opens.push(sample);
      raf(() => {
        sample.first = geometry();
        raf(() => {
          sample.second = geometry();
        });
      });
    }
    function wheel(event: WheelEvent) {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[role="listbox"][aria-label="Polices"]')
      )
        return;
      const sample: FontProfile["wheels"][number] = {
        generated: event.timeStamp,
        dispatch: performance.now(),
      };
      state.wheels.push(sample);
      raf(() => {
        const result = geometry();
        sample.raf = result.at;
        sample.top = result.top;
        sample.rows = result.rows;
      });
    }
    const observer = new PerformanceObserver((entries) =>
      state.tasks.push(
        ...entries
          .getEntries()
          .map((entry) => ({ start: entry.startTime, duration: entry.duration })),
      ),
    );
    observer.observe({ type: "longtask", buffered: false });
    const gpu = navigator.gpu;
    if (gpu) {
      const request = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await request(...args);
        if (adapter) {
          const info = adapter.info;
          state.adapter = {
            vendor: info.vendor,
            architecture: info.architecture,
            fallback: info.isFallbackAdapter,
          };
        }
        return adapter;
      };
    }
    if (typeof GPUQueue !== "undefined") {
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (commands) {
        state.submits++;
        return submit.call(this, commands);
      };
    }
    if (typeof FontFace !== "undefined") {
      const load = FontFace.prototype.load;
      FontFace.prototype.load = function () {
        const entry: FontProfile["faces"][number] = {
          family: this.family,
          start: performance.now(),
        };
        state.faces.push(entry);
        return load.call(this).then(
          (face) => {
            entry.end = performance.now();
            entry.status = face.status;
            return face;
          },
          (error: unknown) => {
            entry.end = performance.now();
            entry.status = "error";
            throw error;
          },
        );
      };
    }
    window.addEventListener("keydown", key, true);
    window.addEventListener("input", input, true);
    window.addEventListener("pointerup", pointer, true);
    window.addEventListener("wheel", wheel, true);
    state.stop = () => {
      observer.disconnect();
      for (const id of frames) cancelAnimationFrame(id);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("input", input, true);
      window.removeEventListener("pointerup", pointer, true);
      window.removeEventListener("wheel", wheel, true);
    };
  });
}

export function fontSurfaceCounters(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      commits: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
          ],
        ),
      ),
      backend: canvas.dataset.backend,
      gpu: JSON.parse(canvas.dataset.gpuStats ?? "{}") as Record<string, number>,
      submits: window.__fontPickerProfile!.submits,
      adapter: window.__fontPickerProfile!.adapter,
      readbacks: { ...window.__musartVideoReadbacks! },
      fontFaces: [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
    };
  });
}
