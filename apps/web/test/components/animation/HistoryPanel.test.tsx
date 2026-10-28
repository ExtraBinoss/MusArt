import { useSyncExternalStore } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { HistoryPanel } from "../../../src/components/animation/HistoryPanel";
import { animationSetup } from "../../support/animation";

test("paginates the actual durable journal, prepares replay, exports JSON and configures retention", async () => {
  const d = await animationSetup(103),
    prepare = vi.fn(),
    download = vi.fn();
  try {
    function Live() {
      const state = useSyncExternalStore(d.session.subscribe, d.session.read);
      return (
        <HistoryPanel
          session={d.session}
          state={state}
          projectId={d.project.id}
          busy={false}
          onPrepare={prepare}
          onClear={() => undefined}
          onDownload={download}
        />
      );
    }
    const view = d.mount(<Live />);
    await waitFor(() => expect(screen.getAllByText("Modifier des calques")).toHaveLength(100));
    fireEvent.click(screen.getByRole("button", { name: "Précédentes" }));
    await waitFor(() => expect(screen.getAllByText("Modifier des calques")).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Récentes" }));
    await waitFor(() => expect(screen.getAllByText("Modifier des calques")).toHaveLength(100));
    fireEvent.click(screen.getByRole("button", { name: "Préparer le timelapse" }));
    expect(prepare).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText("Exporter l’historique en JSON"));
    expect(download).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Suspendre l’enregistrement" }));
    await waitFor(() => expect(d.session.read().recording).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Reprendre l’enregistrement" }));
    await waitFor(() => expect(d.session.read().recording).toBe(true));
    fireEvent.change(screen.getByLabelText("Conserver jusqu’à"), { target: { value: "10" } });
    fireEvent.blur(screen.getByLabelText("Conserver jusqu’à"));
    await waitFor(() => expect(d.session.read().limit).toBe(10));
    expect(d.session.read().events).toBeLessThanOrEqual(10);
    expect(d.errors).toEqual([]);
    view.unmount();
  } finally {
    await d.close();
  }
});
test("reports request failures, recovers and ignores a stale pagination result after a version change", async () => {
  const d = await animationSetup(2);
  try {
    const page = await d.session.page(),
      spy = vi.spyOn(d.session, "page").mockRejectedValueOnce(new Error("offline"));
    function Live() {
      const state = useSyncExternalStore(d.session.subscribe, d.session.read);
      return (
        <HistoryPanel
          session={d.session}
          state={state}
          projectId={d.project.id}
          busy={false}
          onPrepare={() => undefined}
          onClear={() => undefined}
          onDownload={() => undefined}
        />
      );
    }
    const view = d.mount(<Live />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Récentes" }));
    await screen.findAllByText("Modifier des calques");
    expect(screen.queryByRole("alert")).toBeNull();
    let resolveOld!: (value: typeof page) => void;
    spy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Récentes" }));
    await act(async () => {
      d.engine.execute({ type: "renameProject", name: "Updated" });
      await d.session.flush();
    });
    await screen.findByText("Renommer le projet");
    await act(async () => {
      resolveOld({ ...page, entries: [] });
    });
    expect(screen.getByText("Renommer le projet")).toBeVisible();
    view.unmount();
  } finally {
    await d.close();
  }
});
