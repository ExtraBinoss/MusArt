import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { MaskPopover } from "../../../../src/components/layers/attachments/MaskPopover";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
test("a locked mask explains why controls are disabled and unlocks its actual layer once", () => {
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.execute({ type: "updateLayers", ids: [d.image.id], patch: { locked: true } });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <MaskPopover engine={d.engine} page={page} layer={page.layers[2]!} run={d.run}>
        <button>Mask</button>
      </MaskPopover>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Mask" }));
  expect(screen.getByRole("status")).toHaveTextContent("Ce calque est verrouillé");
  expect(screen.getByRole("combobox", { name: "Mode du masque" })).toBeDisabled();
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask).toEqual(
    before.project.pages[0]!.layers[2]!.mask,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("a mask avatar edits the real linked mask with independent undoable commands", async () => {
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <MaskPopover engine={d.engine} page={page} layer={page.layers[2]!} run={d.run}>
        <button>Mask</button>
      </MaskPopover>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Mask" }));
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner la source du masque" }));
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.click(screen.getByLabelText("Inverser le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.inverted).toBe(true);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  await choose("Mode du masque", "Luminosité");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.mode).toBe("luminance");
  const beforeRemoval = d.engine.getSnapshot().project;
  fireEvent.click(screen.getByLabelText("Retirer le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual(
    beforeRemoval.pages[0]!.layers.map((layer) => layer.id),
  );
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(beforeRemoval);
});
test("rapid mask reopen replaces only its scrolled contents and leaves the normal exit lifecycle intact", async () => {
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computedStyle.call(window, element, pseudo);
    if (element.matches(".layer-attachment-popover"))
      Object.defineProperty(style, "animationName", {
        configurable: true,
        get: () => (element.getAttribute("data-state") === "closed" ? "mask-exit" : "mask-enter"),
      });
    return style;
  });
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <MaskPopover engine={d.engine} page={page} layer={page.layers[2]!} run={d.run}>
        <button>Mask</button>
      </MaskPopover>
    );
  }
  d.mount(<Live />);
  const original = d.engine.getSnapshot().project;
  const trigger = screen.getByRole("button", { name: "Mask" });
  fireEvent.click(trigger);
  const popup = screen.getByRole("dialog");
  const viewport = popup.querySelector<HTMLElement>(".layer-attachment-viewport")!;
  viewport.scrollTop = 480;
  fireEvent.scroll(viewport);
  fireEvent.keyDown(popup, { key: "Escape" });
  expect(popup).toBeInTheDocument();
  expect(popup).toHaveAttribute("data-state", "closed");
  expect(popup).toHaveClass("data-[state=closed]:animate-out");
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBe(popup);
  const reopened = popup.querySelector<HTMLElement>(".layer-attachment-viewport")!;
  expect(reopened).not.toBe(viewport);
  expect(viewport).not.toBeInTheDocument();
  expect(reopened.scrollTop).toBe(0);
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(popup, { key: "Escape" });
  expect(popup).toHaveAttribute("data-state", "closed");
  const end = new Event("animationend", { bubbles: true });
  Object.defineProperty(end, "animationName", { value: "mask-exit" });
  fireEvent(popup, end);
  await waitFor(() => expect(popup).not.toBeInTheDocument());
});
