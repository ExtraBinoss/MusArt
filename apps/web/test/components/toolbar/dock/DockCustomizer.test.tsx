import { useState } from "react";
import { expect, test } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { setup } from "../../../support/ui";
import {
  createSearchCommandItems,
  SEARCH_COMMAND_IDS,
} from "../../../../src/components/search/catalog/items";
import { DockCustomizer } from "../../../../src/components/toolbar/dock/DockCustomizer";
import { MAX_DOCK_COMMANDS } from "../../../../src/components/toolbar/dock/preferences";

test("pins real commands, reorders and unpins accessibly, searches and bounds preference size", () => {
  const d = setup();
  const commands = createSearchCommandItems(d.engine.getSnapshot(), (key) => key);
  function Live() {
    const [ids, setIds] = useState(["action:addPage", "missing"]);
    return (
      <>
        <DockCustomizer ids={ids} commands={commands} onChange={setIds} />
        <output>{JSON.stringify(ids)}</output>
      </>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByLabelText("Personnaliser le dock"));
  expect(screen.getByLabelText("Monter addPage")).toBeDisabled();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "save" } });
  fireEvent.click(screen.getByLabelText("Épingler save"));
  expect(screen.getByRole("status")).toHaveTextContent('"action:save"');
  fireEvent.click(screen.getByLabelText("Monter save"));
  expect(screen.getByRole("status")).toHaveTextContent(
    '["action:addPage","action:save","missing"]',
  );
  fireEvent.click(screen.getByLabelText("Descendre addPage"));
  const pinned = screen.getByRole("group", { name: "Raccourcis épinglés" });
  fireEvent.click(within(pinned).getByLabelText("Désépingler addPage"));
  const search = screen.getByRole("searchbox", { name: "Rechercher une commande" });
  fireEvent.change(search, { target: { value: "save" } });
  fireEvent.click(screen.getByRole("button", { name: "Désépingler save", pressed: true }));
  fireEvent.change(search, { target: { value: "zzznomatch" } });
  expect(screen.getByText("Aucune commande correspondante")).toBeInTheDocument();
});
test("available unpinned entries are disabled once twelve shortcuts are present", () => {
  const d = setup();
  d.mount(
    <DockCustomizer
      ids={SEARCH_COMMAND_IDS.slice(0, MAX_DOCK_COMMANDS)}
      commands={createSearchCommandItems(d.engine.getSnapshot(), (key) => key)}
      onChange={() => undefined}
    />,
  );
  fireEvent.click(screen.getByLabelText("Personnaliser le dock"));
  expect(screen.getByRole("button", { name: "Épingler saveAs" })).toBeDisabled();
});
