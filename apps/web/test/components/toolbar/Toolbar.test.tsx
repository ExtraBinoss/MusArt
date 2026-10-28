import { expect, test, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "../../../src/components/toolbar/Toolbar";
import { toolAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("selects tools, imports, and delegates undo redo to engine", () => {
  const { mount, engine, rectangle, store, services, onTask } = setup();
  const onImport = vi.fn();
  engine.execute({ type: "updateLayers", ids: [rectangle.id], patch: { x: 99 } });
  const undo = vi.spyOn(engine, "undo");
  const redo = vi.spyOn(engine, "redo");
  mount(
    <Toolbar
      engine={engine}
      onImport={onImport}
      services={services}
      onTask={onTask}
      onProjects={vi.fn()}
      onExport={vi.fn()}
      onPanelMode={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText("Main"));
  expect(store.get(toolAtom)).toBe("hand");
  expect(screen.getByLabelText("Main")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByLabelText("Importer des images"));
  expect(onImport).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText("Annuler"));
  expect(undo).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText("Rétablir"));
  expect(redo).toHaveBeenCalledOnce();
});
