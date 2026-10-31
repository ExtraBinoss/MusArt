import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { AnimatePanel } from "../../../src/components/animation/AnimatePanel";
import {
  exportReplayVideo,
  VideoExportError,
  type VideoExportOptions,
} from "../../../src/services/animation/export-video";
import { downloadBlob } from "../../../src/services/files/download";
import { animationSetup } from "../../support/animation";
import { choose } from "../../support/select";
const playback = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("../../../src/canvas/session/playback-source", () => ({
  createPlaybackSource: () => playback,
}));
vi.mock("../../../src/services/files/download", async (original) => ({
  ...(await original<typeof import("../../../src/services/files/download")>()),
  downloadBlob: vi.fn(),
}));
vi.mock("../../../src/services/animation/export-video", async (original) => ({
  ...(await original<typeof import("../../../src/services/animation/export-video")>()),
  exportReplayVideo: vi.fn(),
}));
async function prepare() {
  fireEvent.click(screen.getByRole("button", { name: "Préparer le timelapse" }));
  await screen.findByLabelText("Lire la création");
}

test("prepares a real journal, seeks and resets without document commits, and exports configured video and JSON", async () => {
  const d = await animationSetup();
  vi.mocked(exportReplayVideo).mockResolvedValue(new Blob(["video"], { type: "video/mp4" }));
  try {
    const view = d.mount(<AnimatePanel engine={d.engine} services={d.services} />);
    await screen.findAllByText("Modifier des calques");
    const before = d.engine.getSnapshot();
    await prepare();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Position de lecture" }), {
      key: "ArrowRight",
    });
    expect(playback.set).toHaveBeenCalledWith(
      expect.objectContaining({ page: expect.any(Object) }),
    );
    expect(d.engine.getSnapshot()).toBe(before);
    fireEvent.click(screen.getByLabelText("Revenir au document"));
    expect(playback.set).toHaveBeenLastCalledWith(null);
    for (const [label, value] of [
      ["Durée", "2"],
      ["Fréquence", "24"],
      ["Résolution", "0.5"],
    ]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
      fireEvent.blur(screen.getByLabelText(label!));
    }
    await choose("Format", "MP4");
    fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Atelier-replay.mp4"),
    );
    expect(exportReplayVideo).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ duration: 2, fps: 24, scale: 0.5, container: "mp4" }),
    );
    fireEvent.click(screen.getByLabelText("Exporter l’historique en JSON"));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Atelier-history.json"),
    );
    expect(d.engine.getSnapshot()).toBe(before);
    view.unmount();
    expect(playback.set).toHaveBeenLastCalledWith(null);
  } finally {
    await d.close();
  }
});
test("plays through animation frames, pauses and cancels an encoding job without reporting failure", async () => {
  const d = await animationSetup();
  let options: VideoExportOptions | undefined;
  let reject!: (error: unknown) => void;
  vi.mocked(exportReplayVideo).mockImplementation((_spec, next) => {
    options = next;
    return new Promise((_resolve, no) => {
      reject = no;
    });
  });
  try {
    const view = d.mount(<AnimatePanel engine={d.engine} services={d.services} />);
    await prepare();
    let tick: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      tick = callback;
      return 22;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    fireEvent.click(screen.getByLabelText("Lire la création"));
    await act(async () => {
      tick?.(performance.now() + 1000);
    });
    expect(screen.getByLabelText("Mettre en pause")).toBeVisible();
    fireEvent.click(screen.getByLabelText("Mettre en pause"));
    expect(cancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
    await act(async () => {
      options?.onProgress?.(0.5);
    });
    expect(screen.getByRole("button", { name: "Encodage 50 %" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Annuler l’export" }));
    expect(options?.signal?.aborted).toBe(true);
    await act(async () => {
      reject(new DOMException("Cancelled", "AbortError"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
  } finally {
    await d.close();
  }
});
test("shows codec and generic failures and rejects a replay made stale during preparation", async () => {
  const d = await animationSetup();
  try {
    const view = d.mount(<AnimatePanel engine={d.engine} services={d.services} />);
    await prepare();
    vi.mocked(exportReplayVideo).mockRejectedValueOnce(new VideoExportError("noCodec"));
    fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("WebM");
    vi.mocked(exportReplayVideo).mockRejectedValueOnce(new Error("lost"));
    fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Impossible d’exporter"),
    );
    const replay = await d.session.replay();
    let resolve!: (value: typeof replay) => void;
    vi.spyOn(d.session, "replay").mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Préparer le timelapse" }));
    await act(async () => {
      d.engine.execute({ type: "renameProject", name: "Changed" });
      await d.session.flush();
      resolve(replay);
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Le document a changé"),
    );
    view.unmount();
  } finally {
    await d.close();
  }
});

test("clears the active durable journal after confirmation and discards prepared playback without editing the document", async () => {
  const d = await animationSetup();
  vi.mocked(d.services.clearHistory).mockImplementation(() => d.session.clear());
  try {
    const view = d.mount(<AnimatePanel engine={d.engine} services={d.services} />);
    await prepare();
    const before = d.engine.getSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
    expect(d.services.clearHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(d.services.clearHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
    fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
    await waitFor(() => expect(d.session.read().events).toBe(0));
    expect(d.services.clearHistory).toHaveBeenCalledWith(d.project.id);
    expect(d.engine.getSnapshot()).toBe(before);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByLabelText("Lire la création")).toBeNull();
    view.unmount();
  } finally {
    await d.close();
  }
});
