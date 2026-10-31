import type { EditorServices } from "../../../src/state/contracts";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createPage } from "@musart/core";
import { setup } from "../../support/ui";
import { choose } from "../../support/select";
import { ExportWorkspace } from "../../../src/components/export/ExportWorkspace";
import { getExportJobs } from "../../../src/services/export/jobs";
import { ExportLeaveGuard } from "../../../src/components/export/ExportLeaveGuard";
import { confirmExportLeave } from "../../../src/services/export/leave";
import "../../../src/components/export/messages";
vi.mock("../../../src/components/export/MotionExportPreview", () => ({
  MotionExportPreview: () => <div data-testid="motion-preview" />,
}));

test("exports the selected layer in two actions with sensible defaults; work survives closing and edits", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  let finish!: () => void;
  d.services.exportComposition = vi.fn<NonNullable<EditorServices["exportComposition"]>>(
    async (options) => {
      options.onProgress?.(0.42);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        mode: "static",
        filename: "art.png",
        mimeType: "image/png",
        bytes: 20,
        width: 20,
        height: 20,
      };
    },
  );
  const before = d.engine.getSnapshot(),
    close = vi.fn();
  const view = d.mount(<ExportWorkspace engine={d.engine} services={d.services} onClose={close} />);
  expect(screen.getByRole("combobox", { name: "Plan de travail" })).toHaveTextContent(d.page.name);
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(d.services.exportComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        background: true,
        mode: "static",
        selection: [d.rectangle.id],
        scale: 1,
        image: expect.objectContaining({ format: "png", colorMode: "srgb", selectionOnly: true }),
      }),
      expect.objectContaining({ page: d.page, revision: before.revision }),
    ),
  );
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "42");
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  d.engine.execute({ type: "renameProject", name: "Editing continues" });
  expect(getExportJobs(d.engine).pending).toBe(true);
  await act(async () => {
    finish();
  });
  expect(getExportJobs(d.engine).read()).toMatchObject({ status: "complete", percent: 100 });
});
test("switches whole artboard and targets another artboard without editing it; advanced settings start collapsed", async () => {
  const d = setup(),
    other = createPage({ name: "Other print", colorSpace: "cmyk" });
  d.engine.load({ ...d.project, pages: [d.page, other] });
  d.engine.select([d.rectangle.id]);
  const before = d.engine.getSnapshot();
  d.mount(<ExportWorkspace engine={d.engine} services={d.services} onClose={vi.fn()} />);
  expect(screen.queryByRole("switch", { name: "Tous les plans de travail (.zip)" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Avancé" }));
  fireEvent.click(screen.getByRole("switch", { name: "Tous les plans de travail (.zip)" }));
  expect(screen.getByRole("switch", { name: "Plan de travail entier" })).toBeChecked();
  expect(screen.getByRole("switch", { name: "Plan de travail entier" })).toBeDisabled();
  fireEvent.click(screen.getByRole("switch", { name: "Tous les plans de travail (.zip)" }));
  fireEvent.click(screen.getByRole("switch", { name: "Plan de travail entier" }));
  expect(screen.getByText(`Plan de travail · ${d.page.name}`)).toBeVisible();
  await choose("Plan de travail", other.name);
  expect(screen.getByRole("combobox", { name: "Format de fichier" })).toHaveTextContent("PDF");
  expect(screen.getByRole("combobox", { name: "Couleurs de sortie" })).toHaveTextContent("CMJN");
  expect(screen.queryByRole("switch", { name: "Traits de coupe" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Impression" }));
  fireEvent.click(screen.getByRole("switch", { name: "Traits de coupe" }));
  expect(screen.getByRole("switch", { name: "Traits de coupe" })).toBeChecked();
  expect(d.engine.getSnapshot()).toBe(before);
});
test("the leave dialog offers a calm stay option and cancels only after explicit confirmation", async () => {
  const d = setup(),
    jobs = getExportJobs(d.engine);
  let finish!: () => void;
  jobs.start({ kind: "motion", name: "Work", projectId: d.project.id }, async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  d.mount(<ExportLeaveGuard />);
  let result!: Promise<boolean>;
  act(() => {
    result = confirmExportLeave();
  });
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Un export est en cours");
  fireEvent.click(screen.getByRole("button", { name: "Rester dans le projet" }));
  expect(await result).toBe(false);
  expect(jobs.pending).toBe(true);
  act(() => {
    result = confirmExportLeave();
  });
  fireEvent.click(screen.getByRole("button", { name: "Annuler l’export et quitter" }));
  await waitFor(() => expect(jobs.read()?.status).toBe("cancelling"));
  await act(async () => {
    finish();
    await result;
  });
  expect(jobs.read()?.status).toBe("cancelled");
});
