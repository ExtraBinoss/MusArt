import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolSettings } from "../../../src/components/toolbar/ToolSettings";
import {
  toolAtom,
  toleranceAtom,
  selectionModeAtom,
  selectionContiguousAtom,
} from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("offers wand tolerance only in wand mode and prepares local segmentation on demand", async () => {
  const { mount, services, onTask, store } = setup();
  const { container } = mount(<ToolSettings services={services} onTask={onTask} />);
  expect(container).toBeEmptyDOMElement();
  act(() => store.set(toolAtom, "wand"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "60" } });
  fireEvent.blur(screen.getByRole("textbox"));
  expect(store.get(toleranceAtom)).toBe(60);
  act(() => store.set(toolAtom, "segment"));
  fireEvent.click(screen.getByRole("button", { name: "Préparer le modèle local" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Modèle prêt" })).toBeDisabled());
  expect(services.prepareSegmentation).toHaveBeenCalledOnce();
});
test("shows pending download and allows retry after failure", async () => {
  const { mount, services, onTask, store } = setup();
  store.set(toolAtom, "segment");
  vi.mocked(services.prepareSegmentation).mockRejectedValueOnce(new Error("Offline"));
  mount(<ToolSettings services={services} onTask={onTask} />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("button", { name: "Préparer le modèle local" });
});
test("keeps mode controls inside help and changes connected matching without editing the document", () => {
  const { mount, services, onTask, store, engine } = setup();
  store.set(toolAtom, "wand");
  mount(<ToolSettings services={services} onTask={onTask} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(store.get(selectionModeAtom)).toBe("new");
  fireEvent.click(screen.getByRole("button", { name: "Utiliser la baguette magique" }));
  fireEvent.click(screen.getByRole("switch", { name: "Pixels voisins uniquement" }));
  expect(store.get(selectionContiguousAtom)).toBe(false);
  expect(engine.getSnapshot().canUndo).toBe(false);
});
