import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolSettings } from "../../../src/components/toolbar/ToolSettings";
import { toolAtom, toleranceAtom } from "../../../src/state/session/editor";
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
