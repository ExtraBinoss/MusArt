import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { MotionPreviewOptions } from "@musart/render";
import { MotionExportPreview } from "../../../src/components/export/MotionExportPreview";
import { setup } from "../../support/ui";
import "../../../src/components/export/messages";
const state = vi.hoisted(() => ({
  create: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  seek: vi.fn(),
  playing: true,
  time: { value: 0, rate: 1 },
  listener: () => {},
}));
vi.mock("@musart/render", () => ({ createMotionPreview: state.create }));
beforeEach(() => {
  vi.resetAllMocks();
  state.playing = true;
  state.time = { value: 0, rate: 1 };
  state.dispose.mockResolvedValue(undefined);
  state.create.mockImplementation((_project: unknown, options: MotionPreviewOptions) => {
    options.onFrame(document.createElement("canvas"));
    return {
      read: () => ({ playing: state.playing, time: state.time, error: null }),
      subscribe: (listener: () => void) => {
        state.listener = listener;
        return state.stop;
      },
      dispose: state.dispose,
      pause: state.pause,
      play: state.play,
      seek: state.seek,
    };
  });
});
test("mounts its own GPU canvas and updates local clock controls without repainting its parent", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const project = d.engine.getSnapshot().project,
    page = project.pages[0]!;
  const resolver = { resolveOriginal: vi.fn() };
  d.services.mediaResolverFor = vi.fn(() => resolver);
  let renders = 0;
  function Host() {
    renders++;
    return <MotionExportPreview project={project} page={page} services={d.services} />;
  }
  const mount = d.mount(<Host />);
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(state.create).toHaveBeenCalledWith(
    project,
    expect.objectContaining({ compositionId: page.id, edge: 768, mediaResolver: resolver }),
  );
  expect(document.querySelector(".motion-export-preview-surface canvas")).not.toBeNull();
  act(() => {
    state.time = { value: 1, rate: 2 };
    state.listener();
  });
  expect(screen.getByText("0.500 s")).toBeVisible();
  expect(renders).toBe(1);
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "500");
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(state.seek).toHaveBeenCalledWith({ value: 501, rate: 1000 });
  fireEvent.click(screen.getByRole("button", { name: "Mettre l’aperçu d’export en pause" }));
  expect(state.pause).toHaveBeenCalledOnce();
  mount.unmount();
  expect(state.stop).toHaveBeenCalledOnce();
  expect(state.dispose).toHaveBeenCalledOnce();
});
test("an export in progress allocates no preview renderer and later suspension disposes its scope", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const project = d.engine.getSnapshot().project,
    page = project.pages[0]!;
  const mount = d.mount(
    <MotionExportPreview project={project} page={page} services={d.services} paused />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button")).toBeDisabled();
  mount.rerender(<MotionExportPreview project={project} page={page} services={d.services} />);
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  mount.rerender(
    <MotionExportPreview project={project} page={page} services={d.services} paused />,
  );
  mount.unmount();
  expect(state.dispose).toHaveBeenCalledOnce();
});
