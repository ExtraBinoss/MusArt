import "../../../../src/state/i18n";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioLibrary } from "../../../../src/components/motion/audio/AudioLibrary";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
const state = vi.hoisted(() => ({
  bank: {
    open: vi.fn(),
    close: vi.fn(),
    preview: vi.fn(async () => {}),
    stop: vi.fn(),
    clock: vi.fn(),
    atlas: vi.fn(),
  },
  importPreset: vi.fn(async () => {}),
  importFiles: vi.fn(async () => {}),
  enableSoundPreview: vi.fn(async () => {}),
  stopPreview: vi.fn(),
  renders: vi.fn(),
  mount: vi.fn(),
  start: vi.fn(),
  select: vi.fn(),
  dispose: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => state,
}));
vi.mock("../../../../src/components/motion/audio/bank/canvas", () => ({
  BankCanvasPainter: class {
    mount = state.mount;
    start = state.start;
    select = state.select;
    dispose = state.dispose;
    register(_id: string, node: HTMLCanvasElement) {
      state.register(_id);
      node.dataset.waveformReady = "true";
      return () => state.unregister(_id);
    }
  },
}));
vi.mock("../../../../src/components/motion/audio/SfxWaveform", async (load) => {
  const actual = await load<typeof import("../../../../src/components/motion/audio/SfxWaveform")>();
  return {
    SfxWaveform(props: Parameters<typeof actual.SfxWaveform>[0]) {
      state.renders(props.id);
      return <actual.SfxWaveform {...props} />;
    },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});
function setup() {
  const d = audioFixture(),
    error = vi.fn(),
    view = render(
      <TooltipProvider>
        <AudioLibrary engine={d.engine} disabled={false} onError={error} />
      </TooltipProvider>,
    );
  return { d, error, view };
}
function scrollBank(top: number) {
  const list = document.querySelector<HTMLDivElement>(".motion-sfx-list")!;
  list.scrollTop = top;
  fireEvent.scroll(list);
  return list;
}
it("keeps the closed bank lazy and virtualizes grouped ready16px canvases with all15 cues reachable", async () => {
  const d = setup();
  expect(document.querySelectorAll(".motion-sfx-item")).toHaveLength(0);
  expect(state.renders).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  expect(document.querySelectorAll(".motion-sfx-item").length).toBeLessThan(15);
  const presets = new Set<string>(),
    categories = new Set<string>();
  for (const top of [0, 180, 360, 540]) {
    scrollBank(top);
    for (const node of document.querySelectorAll<HTMLElement>(".motion-sfx-item"))
      presets.add(node.dataset.presetId!);
    for (const node of document.querySelectorAll<HTMLElement>("[data-sfx-category]"))
      categories.add(node.dataset.sfxCategory!);
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
      "canvas.motion-sfx-waveform",
    )) {
      expect(canvas.style.height).toBe("16px");
      expect(canvas.dataset.waveformReady).toBe("true");
    }
  }
  expect(presets.size).toBe(15);
  expect([...categories]).toEqual(["whoosh", "impact", "pop", "riser", "tone"]);
  expect(document.querySelector<HTMLElement>(".motion-sfx-virtual")!.style.height).toBe("665px");
  expect(state.mount).toHaveBeenCalledOnce();
  expect(state.register).toHaveBeenCalledTimes(15);
  expect(state.unregister).toHaveBeenCalled();
  expect(document.querySelector(".motion-sfx-item svg.motion-sfx-waveform")).toBeNull();
  expect(screen.queryByText(/Licence MIT|MIT license/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /À propos de ces sons|About these sounds/ }));
  expect(await screen.findByText(/15 sons originaux|15 original MusArt/)).toBeTruthy();
  expect(document.querySelector('input[accept="audio/*"]')).toBeTruthy();
  d.view.unmount();
});
it("previews without rerendering the entire bank and stops the matching playback on leave or scrolling", async () => {
  vi.useFakeTimers();
  const d = setup();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  scrollBank(266);
  await act(() => vi.advanceTimersByTimeAsync(100));
  const play = screen.getByRole("button", { name: /Écouter Soft plop|Preview Soft plop/ }),
    row = play.closest(".motion-sfx-item")!,
    renders = state.renders.mock.calls.length;
  fireEvent.pointerOver(row);
  await act(() => vi.advanceTimersByTimeAsync(35));
  expect(state.bank.preview).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "sound-bank" }),
    expect.objectContaining({ kind: "bank-playback" }),
    "soft-plop",
    false,
  );
  expect(state.start).toHaveBeenCalledWith("soft-plop", expect.any(Object));
  expect(state.renders).toHaveBeenCalledTimes(renders);
  fireEvent.pointerOut(row);
  expect(state.bank.stop).toHaveBeenCalled();
  expect(state.stopPreview).not.toHaveBeenCalled();
  fireEvent.pointerOver(row);
  fireEvent.scroll(document.querySelector(".motion-sfx-list")!);
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(state.bank.preview).toHaveBeenCalledOnce();
  fireEvent.click(play);
  expect(state.bank.preview).toHaveBeenLastCalledWith(
    expect.any(Object),
    expect.any(Object),
    "soft-plop",
    true,
  );
  expect(state.renders).toHaveBeenCalledTimes(renders);
  d.view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(vi.getTimerCount()).toBe(0);
});
it("inserts a real recipe through the normal service boundary and retires hidden or replaced bank owners", async () => {
  const d = setup();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  scrollBank(266);
  fireEvent.click(screen.getByRole("button", { name: /Ajouter Soft plop|Add Soft plop/ }));
  await waitFor(() => expect(state.importPreset).toHaveBeenCalledWith("soft-plop"));
  expect(d.error).not.toHaveBeenCalled();
  d.view.unmount();
  const next = setup();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  act(() => next.d.engine.load(structuredClone(next.d.engine.getSnapshot().project)));
  expect(state.bank.close).toHaveBeenCalled();
  expect(document.querySelector(".motion-audio-library")).toBeNull();
  next.view.unmount();
});
it("keeps retained canvas rows memoized within an admission block and limits filtered categories", async () => {
  const d = setup();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  const renders = state.renders.mock.calls.length;
  scrollBank(1);
  scrollBank(12);
  scrollBank(25);
  expect(state.renders).toHaveBeenCalledTimes(renders);
  const selector = screen.getByRole("combobox", { name: /Effets sonores|Sound effects/ });
  fireEvent.focus(selector);
  fireEvent.keyDown(selector, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /^(Tonalités|Tones)$/ }));
  await waitFor(() => expect(document.querySelectorAll(".motion-sfx-item")).toHaveLength(4));
  expect(document.querySelectorAll("[data-sfx-category]")).toHaveLength(0);
  expect(document.querySelector<HTMLElement>(".motion-sfx-virtual")!.style.height).toBe("152px");
  expect(document.querySelector<HTMLDivElement>(".motion-sfx-list")!.scrollTop).toBe(0);
  expect(state.mount).toHaveBeenCalledOnce();
  d.view.unmount();
});
it("does not let a retired insertion close a newly opened bank owner", async () => {
  let finish!: () => void;
  state.importPreset.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const d = setup(),
    trigger = screen.getByRole("button", { name: /Ajouter un son|Add audio/ });
  fireEvent.click(trigger);
  scrollBank(266);
  const first = state.bank.open.mock.calls.at(-1)![0];
  fireEvent.click(screen.getByRole("button", { name: /Ajouter Soft plop|Add Soft plop/ }));
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  const second = state.bank.open.mock.calls.at(-1)![0];
  expect(second).not.toBe(first);
  await act(async () => finish());
  expect(document.querySelector(".motion-audio-library")).toBeTruthy();
  expect(state.bank.close.mock.calls.some((call) => call[0] === second)).toBe(false);
  expect(d.error).not.toHaveBeenCalled();
  d.view.unmount();
});
