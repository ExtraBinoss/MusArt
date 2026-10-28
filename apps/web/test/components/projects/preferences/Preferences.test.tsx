import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import { Preferences } from "../../../../src/components/projects/preferences/Preferences";
import { themeAtom } from "../../../../src/state/session/editor";
import { choose } from "../../../support/select";
import { setup } from "../../../support/ui";
import {
  snappingPreferences,
  SNAPPING_STORAGE_KEY,
} from "../../../../src/state/snapping/preferences";
test("applies persistent themes and changes between both real catalogs", async () => {
  const d = setup();
  d.mount(<Preferences />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Apparence" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("radiogroup", { name: "Thème" })).toHaveClass("segmented-tabs");
  fireEvent.click(screen.getByRole("radio", { name: "Sombre" }));
  expect(screen.getByRole("radio", { name: "Sombre" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Clair" })).not.toBeChecked();
  expect(d.store.get(themeAtom)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.click(screen.getByRole("radio", { name: "Clair" }));
  fireEvent.click(screen.getByRole("radio", { name: "Système" }));
  expect(screen.getByRole("radio", { name: "Système" })).toBeChecked();
  expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Général" }), { button: 0, ctrlKey: false });
  await choose("Langue", "English");
  await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  await choose("Language", "Français");
});
test("editor settings use the persisted snapping store without editing a document", () => {
  const d = setup();
  act(() => {
    snappingPreferences.reset();
  });
  const before = d.engine.getSnapshot();
  const view = d.mount(
    <Preferences initialSection="editor" editorPreview={<span>Real playground slot</span>} />,
  );
  const enabled = screen.getByRole("switch", { name: "Accrocher aux éléments" }),
    threshold = screen.getByRole("textbox", { name: "Distance d’accrochage" });
  const update = vi.spyOn(snappingPreferences, "update");
  expect(enabled).toBeChecked();
  expect(screen.getByText("Real playground slot")).toBeVisible();
  fireEvent.change(threshold, { target: { value: "9.5" } });
  fireEvent.keyDown(threshold, { key: "Enter" });
  fireEvent.blur(threshold);
  expect(update).toHaveBeenCalledExactlyOnceWith({ threshold: 9.5 });
  expect(snappingPreferences.read().threshold).toBe(9.5);
  expect(JSON.parse(localStorage.getItem(SNAPPING_STORAGE_KEY)!)).toMatchObject({
    version: 1,
    threshold: 9.5,
  });
  fireEvent.click(enabled);
  expect(enabled).not.toBeChecked();
  expect(threshold).toBeDisabled();
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  snappingPreferences.reset();
});
