import "../../../../src/state/i18n";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioLibrary } from "../../../../src/components/motion/audio/AudioLibrary";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
import { SFX_BANK } from "../../../../src/services/motion/audio/sfx";
const state = vi.hoisted(() => ({
  importPreset: vi.fn(async () => {}),
  enableSoundPreview: vi.fn(async () => {}),
  previewPreset: vi.fn(async () => {}),
  preparation: { sfxWaveform: vi.fn(async () => new Float32Array([0, 0.6, 0])) },
  stopPreview: vi.fn(),
  importFiles: vi.fn(async () => {}),
}));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => state,
}));
it("does not construct the closed sound catalog, then mounts it through Radix", () => {
  const d = audioFixture(),
    filter = vi.spyOn(Array.prototype, "filter");
  const view = render(
    <TooltipProvider>
      <AudioLibrary engine={d.engine} disabled={false} onError={vi.fn()} />
    </TooltipProvider>,
  );
  expect(filter.mock.contexts.some((context) => context === SFX_BANK)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  expect(filter.mock.contexts.some((context) => context === SFX_BANK)).toBe(true);
  expect(screen.getByRole("button", { name: /Écouter Soft plop|Preview Soft plop/ })).toBeVisible();
  view.unmount();
});
it("previews and inserts sounds through the real session boundary and exposes audio file import", async () => {
  const d = audioFixture(),
    error = vi.fn();
  const view = render(
    <TooltipProvider>
      <AudioLibrary engine={d.engine} disabled={false} onError={error} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Écouter Soft plop|Preview Soft plop/ }),
  );
  expect(state.previewPreset).toHaveBeenCalledWith("soft-plop", true);
  expect(document.querySelector('input[accept="audio/*"]')).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Ajouter Soft plop|Add Soft plop/ }));
  await waitFor(() => expect(state.importPreset).toHaveBeenCalledWith("soft-plop"));
  expect(error).not.toHaveBeenCalled();
  view.unmount();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("previews hovered/focused sounds after a short delay and retires hidden or switched documents", async () => {
  vi.useFakeTimers();
  const d = audioFixture(),
    view = render(
      <TooltipProvider>
        <AudioLibrary engine={d.engine} disabled={false} onError={() => {}} />
      </TooltipProvider>,
    );
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un son|Add audio/ }));
  const play = screen.getByRole("button", { name: /Écouter Soft plop|Preview Soft plop/ }),
    row = play.closest(".motion-sfx-item")!;
  fireEvent.pointerOver(row);
  await act(() => vi.advanceTimersByTimeAsync(150));
  expect(state.previewPreset).toHaveBeenCalledWith("soft-plop", false);
  expect(
    view.container.ownerDocument.querySelector(".motion-sfx-waveform path")?.getAttribute("d"),
  ).toContain("Q");
  fireEvent.pointerOut(row);
  expect(state.stopPreview).toHaveBeenCalled();
  fireEvent.focus(play);
  await act(() => vi.advanceTimersByTimeAsync(150));
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(screen.getByText(/Survolez un son|Hover or focus/)).toBeTruthy();
  hidden.mockRestore();
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  expect(screen.queryByRole("button", { name: /Écouter Soft plop|Preview Soft plop/ })).toBeNull();
  view.unmount();
  const auditions = state.previewPreset.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(state.previewPreset).toHaveBeenCalledTimes(auditions);
  expect(vi.getTimerCount()).toBe(0);
});
