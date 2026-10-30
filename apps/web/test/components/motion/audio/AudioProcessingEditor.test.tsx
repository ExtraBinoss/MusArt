import "../../../../src/state/i18n";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AudioProcessingEditor } from "../../../../src/components/motion/audio/AudioProcessingEditor";
import { Popover } from "../../../../src/components/ui/popover";
import { audioFixture } from "../../../support/audio";
const state = vi.hoisted(() => ({ previewTrack: vi.fn(async () => {}) }));
vi.mock("../../../../src/services/motion/audio/session", () => ({
  getMotionAudioSession: () => state,
}));
it("keeps edits local until Apply publishes one reversible processing command", () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot(),
    close = vi.fn();
  render(
    <Popover open>
      <AudioProcessingEditor
        engine={d.engine}
        origin={{
          project: before.project,
          pageId: before.pageId,
          track: d.track(),
          section: "fadeIn",
        }}
        onClose={close}
      />
    </Popover>,
  );
  const input = screen.getByRole("spinbutton", {
    name: /Durée du fondu d’entrée|Fade in duration/,
  });
  fireEvent.change(input, { target: { value: "250" } });
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: /Appliquer|Apply/ }));
  expect(d.track().processing!.fadeIn.value / d.track().processing!.fadeIn.rate).toBe(0.25);
  expect(close).toHaveBeenCalledOnce();
  d.engine.undo();
  expect(d.track().processing).toBeUndefined();
});
it("rejects invalid fade durations and auditions the draft through the audio worker port", async () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot();
  render(
    <Popover open>
      <AudioProcessingEditor
        engine={d.engine}
        origin={{
          project: before.project,
          pageId: before.pageId,
          track: d.track(),
          section: "fadeOut",
        }}
        onClose={vi.fn()}
      />
    </Popover>,
  );
  const input = screen.getByRole("spinbutton", {
    name: /Durée du fondu de sortie|Fade out duration/,
  });
  fireEvent.change(input, { target: { value: "99999" } });
  fireEvent.click(screen.getByRole("button", { name: /Appliquer|Apply/ }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.change(input, { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: /Écouter|Preview/ }));
  await waitFor(() =>
    expect(state.previewTrack).toHaveBeenCalledWith(d.track().id, expect.any(Object), 1, "fadeOut"),
  );
});
