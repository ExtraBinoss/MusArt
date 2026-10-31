import type { EditorServices } from "../../../../src/state/contracts";
import { getExportJobs } from "../../../../src/services/export/jobs";
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

test("bottom-nav export opens a same export dialog with the real shared settings", async () => {
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
  expect(within(nav).getByRole("button", { name: "Exporter", hidden: true })).toHaveAttribute(
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

test("a closed mobile dialog leaves export running and navigation usable", async () => {
  const d = setup();
  let finish!: () => void;
  d.services.exportComposition = vi.fn<NonNullable<EditorServices["exportComposition"]>>(
    async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        mode: "static",
        filename: "art.png",
        mimeType: "image/png",
        bytes: 4,
        width: 10,
        height: 10,
      };
    },
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
  expect(document.querySelector(".export-workspace")).not.toBeNull();
  expect(document.querySelector(".export-popover")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Exporter l’image" }));
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(getExportJobs(d.engine).pending).toBe(true);
  for (const button of within(nav).getAllByRole("button")) expect(button).not.toBeDisabled();
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  for (const button of within(nav).getAllByRole("button")) expect(button).not.toBeDisabled();
});
