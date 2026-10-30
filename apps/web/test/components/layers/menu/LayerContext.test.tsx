import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { ContextMenu, ContextMenuTrigger } from "../../../../src/components/ui/context-menu";
import { LayerContext } from "../../../../src/components/layers/menu/LayerContext";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { TransitionRequestHost } from "../../../../src/components/motion/transitions/TransitionRequestHost";
test("the actual layer context offers one group action and updates it to ungroup, preserving one undo", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.text.id]);
  function Live() {
    const s = useEngine(d.engine);
    return (
      <ContextMenu>
        <ContextMenuTrigger>Stack</ContextMenuTrigger>
        <LayerContext
          engine={d.engine}
          page={s.project.pages[0]!}
          selection={s.selection}
          run={d.run}
        />
      </ContextMenu>
    );
  }
  d.mount(
    <>
      <Live />
      <TransitionRequestHost engine={d.engine} />
    </>,
  );
  fireEvent.contextMenu(screen.getByText("Stack"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Grouper la sélection" }));
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.filter((l) => l.kind === "group"),
  ).toHaveLength(1);
  fireEvent.contextMenu(screen.getByText("Stack"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dégrouper" }));
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.filter((l) => l.kind === "group"),
  ).toHaveLength(0);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.kind === "group")).toBe(
    true,
  );
});

test("a direct layer transition action initializes Static and survives the closing layer menu", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  function Live() {
    const s = useEngine(d.engine);
    return (
      <ContextMenu>
        <ContextMenuTrigger>Stack</ContextMenuTrigger>
        <LayerContext
          engine={d.engine}
          page={s.project.pages[0]!}
          selection={s.selection}
          run={d.run}
        />
      </ContextMenu>
    );
  }
  d.mount(
    <>
      <Live />
      <TransitionRequestHost engine={d.engine} />
    </>,
  );
  fireEvent.contextMenu(screen.getByText("Stack"));
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
  });
  expect(await screen.findByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.motion?.mode).toBe("motion");
});

test("layer visibility and locking remain undoable and Delete stays below its own separator", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  function Live() {
    const s = useEngine(d.engine);
    return (
      <ContextMenu>
        <ContextMenuTrigger>Stack</ContextMenuTrigger>
        <LayerContext
          engine={d.engine}
          page={s.project.pages[0]!}
          selection={s.selection}
          run={d.run}
        />
      </ContextMenu>
    );
  }
  d.mount(<Live />);
  fireEvent.contextMenu(screen.getByText("Stack"));
  const remove = await screen.findByRole("menuitem", { name: /Supprimer/ });
  expect(remove).toHaveAttribute("data-variant", "destructive");
  expect(remove.previousElementSibling).toHaveAttribute("role", "separator");
  fireEvent.click(screen.getByRole("menuitem", { name: "Masquer" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(false);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(true);
  fireEvent.contextMenu(screen.getByText("Stack"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Verrouiller" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
  fireEvent.contextMenu(screen.getByText("Stack"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Déverrouiller" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(false);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
});
