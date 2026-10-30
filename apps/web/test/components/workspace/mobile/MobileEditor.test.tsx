import { useState } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MobileEditor } from "../../../../src/components/workspace/mobile/MobileEditor";
import { MobileControlsContext } from "../../../../src/components/workspace/mobile/use-mobile";
import { setup } from "../../../support/ui";
test("mobile navigation starts with an unobstructed canvas and opens one sheet at a time", async () => {
  const d = setup(),
    exportOpen = vi.fn();
  d.engine.select([d.rectangle.id]);
  d.mount(
    <MobileControlsContext value>
      <MobileEditor
        engine={d.engine}
        services={d.services}
        run={d.run}
        onTask={d.onTask}
        exportOpen={false}
        onExportOpenChange={exportOpen}
        tools={<button>Import media</button>}
      />
    </MobileControlsContext>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Propriétés" }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Propriétés" })).toBeVisible());
  expect(screen.getByRole("slider", { name: "Régler Largeur" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Calques" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  await waitFor(() => expect(screen.getByRole("tree", { name: "Calques" })).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Outils" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Import media" })).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Fermer le panneau" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Motion" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Passer en mode Motion" })).toBeVisible(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(exportOpen).toHaveBeenCalledExactlyOnceWith(true);
});

test("bottom-nav export opens a dedicated sheet with the real shared settings", async () => {
  const d = setup();
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <MobileControlsContext value>
        <MobileEditor
          engine={d.engine}
          services={d.services}
          run={d.run}
          onTask={d.onTask}
          exportOpen={open}
          onExportOpenChange={setOpen}
          tools={<button>Import media</button>}
        />
      </MobileControlsContext>
    );
  }
  d.mount(<Host />);
  const nav = screen.getByRole("navigation", { name: "Outils de l’éditeur" });
  fireEvent.click(within(nav).getByRole("button", { name: "Outils" }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Outils" })).toBeVisible());
  fireEvent.click(within(nav).getByRole("button", { name: "Exporter" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible(),
  );
  expect(within(nav).getByRole("button", { name: "Exporter" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Exporter la composition" })).toBeNull(),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(d.services.exportImage).not.toHaveBeenCalled();
});

test("pending export disables navigation and successful completion closes its mobile sheet", async () => {
  const d = setup();
  let finish!: () => void;
  vi.mocked(d.services.exportImage).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <MobileControlsContext value>
        <MobileEditor
          engine={d.engine}
          services={d.services}
          run={d.run}
          onTask={d.onTask}
          exportOpen={open}
          onExportOpenChange={setOpen}
          tools={<button>Import media</button>}
        />
      </MobileControlsContext>
    );
  }
  d.mount(<Host />);
  const nav = screen.getByRole("navigation", { name: "Outils de l’éditeur" });
  fireEvent.click(within(nav).getByRole("button", { name: "Exporter" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible(),
  );
  expect(document.querySelector(".mobile-sheet-export")).not.toBeNull();
  expect(document.querySelector(".export-popover")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  for (const button of within(nav).getAllByRole("button")) expect(button).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fermer le panneau" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeInTheDocument();
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  for (const button of within(nav).getAllByRole("button")) expect(button).not.toBeDisabled();
});
