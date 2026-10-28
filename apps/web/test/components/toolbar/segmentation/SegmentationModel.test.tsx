import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SegmentationModel } from "../../../../src/components/toolbar/segmentation/SegmentationModel";
import { LocalModelManager } from "../../../../src/services/selection/model/manager";
import { MODEL_BYTES } from "../../../../src/services/selection/model/manifest";
import { setup } from "../../../support/ui";
test("shows real byte/percentage progress, cancellation and cached-model removal without document changes", async () => {
  let cached = { available: true, bytes: MODEL_BYTES, files: 4, supported: true };
  const d = setup(),
    before = d.engine.getSnapshot(),
    cancel = vi.fn(),
    inspect = vi.fn(async () => cached),
    remove = vi.fn(async () => {
      cached = { available: false, bytes: 0, files: 0, supported: true };
      return cached;
    });
  let resolve!: () => void;
  const model = new LocalModelManager({
    prepare: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    cancel,
    inspect,
    remove,
  });
  d.services.segmentationModel = model;
  const view = d.mount(<SegmentationModel services={d.services} onTask={d.onTask} />);
  await screen.findByText(/Sur cet appareil/);
  fireEvent.click(screen.getByRole("button", { name: "Charger le modèle local" }));
  expect(screen.getByRole("progressbar", { name: "Téléchargement du modèle" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  act(() => {
    model.note({ file: "vision_encoder.onnx", status: "progress", loaded: 10_000_000 });
  });
  expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeGreaterThan(25);
  expect(screen.getByText(/10 Mo/)).toBeVisible();
  await act(async () => resolve());
  await waitFor(() => expect(screen.getByRole("button", { name: "Modèle prêt" })).toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le modèle téléchargé" }));
  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  await screen.findByRole("button", { name: "Préparer le modèle local" });
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Préparer le modèle local" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalled();
  await act(async () => resolve());
  view.unmount();
  model.dispose();
});
test("reports real cache/preparation failures and keeps the legacy preparation API functional", async () => {
  const d = setup();
  const model = new LocalModelManager({
    prepare: async () => {
      throw Error("offline");
    },
    cancel: vi.fn(),
    inspect: async () => {
      throw Error("denied");
    },
  });
  d.services.segmentationModel = model;
  const view = d.mount(<SegmentationModel services={d.services} onTask={d.onTask} />);
  await screen.findByText("Impossible de vérifier le modèle téléchargé.");
  fireEvent.click(screen.getByRole("button", { name: "Préparer le modèle local" }));
  await screen.findByText("L’opération sur le modèle a échoué. Réessayez.");
  view.unmount();
  model.dispose();
  delete d.services.segmentationModel;
  vi.mocked(d.services.prepareSegmentation).mockRejectedValueOnce(Error("offline"));
  d.mount(<SegmentationModel services={d.services} onTask={d.onTask} />);
  fireEvent.click(screen.getByRole("button", { name: "Préparer le modèle local" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Préparer le modèle local" })).not.toBeDisabled(),
  );
});
