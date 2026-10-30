import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { DropCue } from "../../../../src/components/layers/drag/DropCue";
import { setup } from "../../../support/ui";
test("portals the translated drag intent above the tree and cleans viewport listeners", () => {
  const d = setup(),
    anchor = { current: document.createElement("div") },
    bounds = vi.spyOn(anchor.current, "getBoundingClientRect"),
    remove = vi.spyOn(window, "removeEventListener");
  bounds.mockReturnValue(new DOMRect(10, 80, 100, 36));
  anchor.current.dataset.layerDropCueTarget = "true";
  const view = d.mount(<DropCue anchor={anchor} position="mask" />),
    cue = screen.getByRole("status");
  expect(cue.parentElement).toBe(document.body);
  expect(cue).toHaveTextContent("Ajouter comme masque");
  expect(cue).toHaveClass("layer-drop-cue");
  expect(cue.style.top).toBe("76px");
  bounds.mockReturnValue(new DOMRect(10, 40, 100, 36));
  fireEvent.scroll(window);
  expect(cue.style.top).toBe("36px");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
  expect(screen.queryByRole("status")).toBeNull();
});

test("shows one cue on the actual target when the same layer is visible in two surfaces", async () => {
  const d = setup(),
    first = { current: document.createElement("div") },
    second = { current: document.createElement("div") };
  first.current.dataset.layerDropCueTarget = "true";
  const view = d.mount(
    <>
      <DropCue anchor={first} position="before" />
      <DropCue anchor={second} position="after" />
    </>,
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Insérer au-dessus");
  delete first.current.dataset.layerDropCueTarget;
  second.current.dataset.layerDropCueTarget = "true";
  await Promise.resolve();
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Insérer en dessous");
  view.unmount();
  expect(screen.queryByRole("status")).toBeNull();
});
