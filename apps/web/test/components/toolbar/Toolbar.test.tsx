import { expect, test, vi } from "vitest";
import { act, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "../../../src/components/toolbar/Toolbar";
import { toolAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { i18n } from "../../../src/state/i18n";
import { keybindings } from "../../../src/state/keybindings/store";
const renders = vi.hoisted(() => ({ tools: vi.fn(), shape: vi.fn() }));
vi.mock("../../../src/components/shared/IconButton", async (original) => {
  const module = await original<typeof import("../../../src/components/shared/IconButton")>();
  return {
    IconButton: (props: Parameters<typeof module.IconButton>[0]) => {
      if (props.className === "tool-button") renders.tools(props.label, props.shortcut);
      return <module.IconButton {...props} />;
    },
  };
});
vi.mock("../../../src/components/assets/ShapeToolSlot", async (original) => {
  const module = await original<typeof import("../../../src/components/assets/ShapeToolSlot")>();
  return {
    ShapeToolSlot: (props: Parameters<typeof module.ShapeToolSlot>[0]) => {
      renders.shape();
      return <module.ShapeToolSlot {...props} />;
    },
  };
});
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

test("real tool children skip command updates while tools, language and shortcuts remain live", async () => {
  const d = setup();
  renders.tools.mockClear();
  renders.shape.mockClear();
  const view = d.mount(
    <Toolbar
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={vi.fn()}
      onProjects={vi.fn()}
      onExport={vi.fn()}
      onPanelMode={vi.fn()}
    />,
  );
  try {
    const hand = screen.getByLabelText("Main");
    expect(renders.tools).toHaveBeenCalledTimes(5);
    expect(renders.shape).toHaveBeenCalledOnce();
    act(() => d.engine.select([d.rectangle.id]));
    act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 81 } }));
    expect(screen.getByLabelText("Main")).toBe(hand);
    expect(renders.tools).toHaveBeenCalledTimes(5);
    expect(renders.shape).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Annuler")).toBeEnabled();
    fireEvent.click(hand);
    expect(d.store.get(toolAtom)).toBe("hand");
    expect(hand).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Outil forme"));
    expect(d.store.get(toolAtom)).toBe("shape");
    expect(screen.getByLabelText("Outil forme")).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByLabelText("Hand")).toBe(hand);
    const before = renders.tools.mock.calls.length;
    act(() =>
      keybindings.assign("action:toolHand", [
        {
          key: "F9",
          mod: false,
          alt: false,
          shift: false,
        },
      ]),
    );
    expect(renders.tools.mock.calls.slice(before)).toContainEqual(["Hand", "F9"]);
  } finally {
    act(() => keybindings.reset("action:toolHand"));
    await act(async () => {
      await i18n.changeLanguage("fr");
    });
    view.unmount();
  }
});
