import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { FormatPresets } from "../../../../src/components/projects/creation/FormatPresets";
import { setup } from "../../../support/ui";

test("keeps the format catalog lazy and selects custom or category presets", async () => {
  const d = setup(),
    choose = vi.fn();
  d.mount(<FormatPresets selected="custom" onChoose={choose} />);
  expect(screen.queryByRole("tab")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Choisir un format" }));
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Vidéo" }), { button: 0 });
  expect(screen.queryByRole("button", { name: /Publication Instagram/ })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: /Personnalisé/ }));
  expect(choose).toHaveBeenCalledExactlyOnceWith(null);
  expect(screen.queryByRole("tab")).toBeNull();
});

test("a pending creation disables an already open portal catalog", () => {
  const d = setup(),
    choose = vi.fn();
  const view = d.mount(<FormatPresets selected="custom" onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Choisir un format" }));
  view.rerender(<FormatPresets selected="custom" disabled onChoose={choose} />);
  const card = screen.getByRole("button", { name: /Publication Instagram/ });
  expect(card).toBeDisabled();
  for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
  fireEvent.click(card);
  expect(choose).not.toHaveBeenCalled();
});
