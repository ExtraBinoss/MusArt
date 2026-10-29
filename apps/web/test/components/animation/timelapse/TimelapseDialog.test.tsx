import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TimelapseDialog } from "../../../../src/components/animation/timelapse/TimelapseDialog";
import { animationSetup } from "../../../support/animation";
import { downloadBlob } from "../../../../src/services/files/download";
import {
  exportReplayVideo,
  VideoExportError,
  type VideoExportOptions,
} from "../../../../src/services/animation/export-video";

vi.mock("../../../../src/components/animation/timelapse/use-timelapse-preview", () => ({
  useTimelapsePreview: () => ({
    viewport: { current: null },
    scrubber: { current: null },
    clock: { current: null },
    status: "ready",
    playing: false,
    controls: {
      current: {
        pause: vi.fn(),
        play: vi.fn(),
        seek: vi.fn(),
        release: vi.fn().mockResolvedValue(undefined),
      },
    },
  }),
}));
vi.mock("../../../../src/services/files/download", async (original) => ({
  ...(await original<typeof import("../../../../src/services/files/download")>()),
  downloadBlob: vi.fn(),
}));
vi.mock("../../../../src/services/animation/export-video", async (original) => ({
  ...(await original<typeof import("../../../../src/services/animation/export-video")>()),
  exportReplayVideo: vi.fn(),
}));

test("replays real history and validates final duration without exposing the old Animate controls", async () => {
  const d = await animationSetup();
  vi.mocked(exportReplayVideo).mockResolvedValue(new Blob(["video"], { type: "video/webm" }));
  try {
    const before = d.engine.getSnapshot();
    const view = d.mount(
      <TimelapseDialog engine={d.engine} services={d.services} onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeEnabled(),
    );
    expect(screen.queryByLabelText("Fréquence")).toBeNull();
    expect(screen.queryByLabelText("Conserver jusqu’à")).toBeNull();
    const duration = screen.getByLabelText("Durée finale de la vidéo");
    expect(duration).toHaveValue(10);
    for (const value of ["0", "31", ""]) {
      fireEvent.change(duration, { target: { value } });
      expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeDisabled();
      expect(duration).toHaveAttribute("aria-invalid", "true");
    }
    fireEvent.change(duration, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Atelier-timelapse.webm"),
    );
    expect(exportReplayVideo).toHaveBeenCalledWith(
      expect.objectContaining({ events: expect.any(Array) }),
      expect.objectContaining({ duration: 1, fps: 30, container: "auto" }),
    );
    fireEvent.change(duration, { target: { value: "30" } });
    expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeEnabled();
    expect(d.engine.getSnapshot()).toBe(before);
    view.unmount();
  } finally {
    await d.close();
  }
});

test("reports real codec errors, cancels export and ignores a late completed result", async () => {
  const d = await animationSetup();
  const close = vi.fn();
  try {
    const view = d.mount(
      <TimelapseDialog engine={d.engine} services={d.services} onClose={close} />,
    );
    const button = screen.getByRole("button", { name: "Exporter la vidéo" });
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(exportReplayVideo).mockRejectedValueOnce(new VideoExportError("noCodec"));
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce navigateur");
    let options!: VideoExportOptions;
    let finish!: (blob: Blob) => void;
    vi.mocked(exportReplayVideo).mockImplementationOnce((_spec, next) => {
      options = next;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    fireEvent.click(button);
    await waitFor(() => expect(options).toBeDefined());
    await act(async () => {
      options.onProgress?.(0.5);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.5");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(options.signal?.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    const downloads = vi.mocked(downloadBlob).mock.calls.length;
    await act(async () => {
      finish(new Blob(["late"], { type: "video/mp4" }));
    });
    expect(downloadBlob).toHaveBeenCalledTimes(downloads);
    view.unmount();
  } finally {
    await d.close();
  }
});

test("rejects empty history and invalidates prepared history after a document edit", async () => {
  const d = await animationSetup(0);
  try {
    const view = d.mount(
      <TimelapseDialog engine={d.engine} services={d.services} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Faites quelques modifications");
    expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeDisabled();
    view.unmount();
    act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
    await d.session.flush();
    const next = d.mount(
      <TimelapseDialog engine={d.engine} services={d.services} onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeEnabled(),
    );
    act(() => d.engine.execute({ type: "renameProject", name: "Changed again" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Le document a changé");
    expect(screen.getByRole("button", { name: "Exporter la vidéo" })).toBeDisabled();
    next.unmount();
  } finally {
    await d.close();
  }
});
