import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { setup } from "../../support/ui";
import { MotionExportSettings } from "../../../src/components/export/MotionExportSettings";
import { ExportScopeError } from "../../../src/services/session/export-scope";
import "../../../src/components/export/messages";
vi.mock("../../../src/components/export/MotionExportPreview", () => ({
  MotionExportPreview: ({ paused }: { paused: boolean }) => (
    <div data-testid="preview" data-paused={paused} />
  ),
}));
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const origin = d.engine.getSnapshot(),
    page = origin.project.pages[0]!;
  const close = vi.fn(),
    pendingRef = { current: false };
  const scope = {
    projectId: origin.project.id,
    compositionId: page.id,
    revision: origin.revision,
    page,
  };
  const mount = () =>
    d.mount(
      <MotionExportSettings
        page={page}
        project={origin.project}
        scope={scope}
        services={d.services}
        onTask={async (action) => {
          await action();
          return true;
        }}
        onOpenChange={close}
        pendingRef={pendingRef}
      />,
    );
  return { ...d, page, scope, close, pendingRef, mount };
}
test("publishes precise authored timing/defaults and closes only after real delivery", async () => {
  const d = fixture();
  const exportComposition = vi
    .fn<NonNullable<typeof d.services.exportComposition>>()
    .mockResolvedValue({
      mode: "motion",
      filename: "movie.mp4",
      mimeType: "video/mp4",
      bytes: 10,
      width: 1080,
      height: 1080,
    });
  d.services.exportComposition = exportComposition;
  d.mount();
  fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
  await waitFor(() => expect(d.close).toHaveBeenCalledWith(false));
  expect(exportComposition).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "motion",
      compositionId: d.page.id,
      scale: 1,
      frameRate: d.page.motion!.frameRate,
      container: "auto",
      videoBitrate: 8_000_000,
      audioBitrate: 192_000,
      audio: true,
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }),
    d.scope,
  );
  expect(d.pendingRef.current).toBe(false);
});
test("Cancel aborts the real job, holds the pending gate through cleanup and never closes as success", async () => {
  const d = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const exportComposition = vi.fn<NonNullable<typeof d.services.exportComposition>>(
    async (options) => {
      options.onProgress?.(0.12);
      await gate;
      options.signal!.throwIfAborted();
      return {
        mode: "motion",
        filename: "movie.mp4",
        mimeType: "video/mp4",
        bytes: 10,
        width: 1,
        height: 1,
      };
    },
  );
  d.services.exportComposition = exportComposition;
  d.mount();
  fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
  await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("value", "12"));
  expect(screen.getByTestId("preview")).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(exportComposition.mock.calls[0]![0].signal!.aborted).toBe(true);
  expect(d.pendingRef.current).toBe(true);
  await act(async () => {
    release();
    await gate;
  });
  await waitFor(() => expect(d.pendingRef.current).toBe(false));
  expect(d.close).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});
test("stale scope fails visibly and unavailable services never simulate a video", async () => {
  const d = fixture();
  d.services.exportComposition = vi.fn().mockRejectedValue(new ExportScopeError());
  const mount = d.mount();
  fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("La cible de l’export a changé"),
  );
  expect(d.close).not.toHaveBeenCalled();
  mount.unmount();
  const other = fixture();
  other.mount();
  fireEvent.click(screen.getByRole("button", { name: "Exporter la vidéo" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("indisponible"));
  expect(other.close).not.toHaveBeenCalled();
});
