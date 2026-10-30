import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createPage } from "@musart/core";
import { setup } from "../../support/ui";
import { CompositionExportSettings } from "../../../src/components/export/CompositionExportSettings";
import "../../../src/components/export/messages";
vi.mock("../../../src/components/export/MotionExportSettings", () => ({
  MotionExportSettings: ({ page }: { page: { id: string } }) => (
    <div data-testid="motion-export">{page.id}</div>
  ),
}));
test("defaults to the active artboard and routes Static selection through the common service", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  const deliver = vi.fn().mockResolvedValue({ mode: "static" });
  d.services.exportComposition = deliver;
  const before = d.engine.getSnapshot();
  d.mount(
    <CompositionExportSettings
      engine={d.engine}
      page={d.page}
      pageCount={1}
      services={d.services}
      pendingRef={{ current: false }}
      onTask={d.onTask}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Plan de travail" })).toHaveTextContent(d.page.name);
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() =>
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "static",
        compositionId: d.page.id,
        selection: [d.rectangle.id],
        image: expect.objectContaining({ selectionOnly: true }),
      }),
      {
        projectId: before.project.id,
        compositionId: d.page.id,
        revision: before.revision,
        page: d.page,
      },
    ),
  );
  expect(d.engine.getSnapshot()).toBe(before);
});
test("an artboard menu request targets Motion by ID without changing the editor's active page", () => {
  const d = setup(),
    other = createPage({ id: "other", name: "Motion artwork" });
  d.engine.load({ ...d.project, pages: [d.page, other] });
  d.engine.setPage(other.id);
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.setPage(d.page.id);
  const before = d.engine.getSnapshot();
  d.mount(
    <CompositionExportSettings
      engine={d.engine}
      initialCompositionId={other.id}
      page={d.page}
      pageCount={2}
      services={d.services}
      pendingRef={{ current: false }}
      onTask={d.onTask}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Plan de travail" })).toHaveTextContent(
    "Motion artwork",
  );
  expect(screen.getByTestId("motion-export")).toHaveTextContent(other.id);
  expect(d.engine.getSnapshot()).toBe(before);
});
