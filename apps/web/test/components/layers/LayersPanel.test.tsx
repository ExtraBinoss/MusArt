import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, createEvent, within } from "@testing-library/react";
import { createLayer, createPage, createEffect } from "@musart/core";
import { attachmentSelection } from "../../../src/state/selection/attachments";
import { LayersPanel, layerDepth, flattenLayers } from "../../../src/components/layers/LayersPanel";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
function renderLayers() {
  const data = setup();
  function Live() {
    const s = useEngine(data.engine);
    return (
      <LayersPanel
        engine={data.engine}
        page={s.project.pages.find((page) => page.id === s.pageId)!}
        project={s.project}
        selection={s.selection}
        run={data.run}
      />
    );
  }
  data.mount(<Live />);
  return data;
}
test("virtual scroll retains memoized controls even while an attachment disables compositing", () => {
  history.replaceState({}, "", "/?automation=1");
  const d = renderLayers(),
    effect = createEffect("brightness");
  act(() => {
    d.engine.execute({
      type: "addLayers",
      layers: Array.from({ length: 100 }, (_, at) =>
        createLayer("rectangle", { name: `Window ${at}` }),
      ),
    });
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  act(() => {
    attachmentSelection(d.engine).select(page, {
      kind: "effect",
      pageId: page.id,
      layerId: d.rectangle.id,
      effectId: effect.id,
    });
  });
  const tree = screen.getByRole("tree", { name: "Calques" }),
    compositing = screen.getByRole("group", { name: "Composition des calques" }),
    menu = screen.getByRole("button", { name: "Actions des calques" }),
    effects = screen.getByLabelText("Ajouter un effet"),
    adjustments = screen.getByLabelText("Ajouter un réglage");
  const before = [compositing, menu, effects, adjustments].map((node) => node.dataset.reactRenders),
    panel = document.querySelector<HTMLElement>(".layers-panel")!,
    panelBefore = Number(panel.dataset.reactRenders);
  for (const top of [360, 720, 1080]) fireEvent.scroll(tree, { target: { scrollTop: top } });
  expect(Number(panel.dataset.reactRenders)).toBeGreaterThan(panelBefore);
  expect(
    [compositing, menu, effects, adjustments].map((node) => node.dataset.reactRenders),
  ).toEqual(before);
  expect(screen.getByRole("textbox", { name: "Opacité" })).toBeDisabled();
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(effects).toBeDisabled();
  expect(adjustments).toBeDisabled();
  history.replaceState({}, "", "/");
});
test.each(["footer", "context"] as const)(
  "%s deletes the selected effect rather than its owner",
  async (surface) => {
    const d = renderLayers(),
      effect = createEffect("dither");
    act(() => {
      d.engine.execute({
        type: "updateLayers",
        ids: [d.rectangle.id],
        patch: { effects: [effect] },
      });
      d.engine.load(d.engine.getSnapshot().project);
    });
    const page = d.engine.getSnapshot().project.pages[0]!;
    act(() => {
      attachmentSelection(d.engine).select(page, {
        kind: "effect",
        pageId: page.id,
        layerId: d.rectangle.id,
        effectId: effect.id,
      });
    });
    expect(screen.getByRole("textbox", { name: "Opacité" })).toBeDisabled();
    if (surface === "context") {
      fireEvent.contextMenu(document.querySelector(`[data-attachment-effect-id="${effect.id}"]`)!);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Retirer l’effet" }));
    } else fireEvent.click(screen.getByRole("button", { name: "Retirer l’effet" }));
    expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.id).toBe(effect.id);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  },
);
test("keeps footer creation and selection actions distinct, square-sized and accessibly named", () => {
  const d = renderLayers(),
    footer = screen.getByRole("group", { name: "Actions des calques" }),
    create = within(footer).getByRole("group", { name: "Ajouter des effets et corrections" }),
    selected = within(footer).getByRole("group", { name: "Actions de la sélection" });
  expect(within(create).getAllByRole("button")).toHaveLength(2);
  expect(within(selected).getAllByRole("button")).toHaveLength(2);
  for (const button of within(footer).getAllByRole("button")) {
    expect(button).toHaveAttribute("data-size", "icon-sm");
    expect(button).toBeDisabled();
  }
  fireEvent.click(screen.getByText(d.rectangle.name));
  for (const button of within(footer).getAllByRole("button")) expect(button).toBeEnabled();
  expect(
    within(selected).getByRole("button", { name: "Supprimer la sélection (1)" }),
  ).toBeEnabled();
});
test("selects rows without eye and lock actions altering selection; renames accessibly", () => {
  const { engine, rectangle, text } = renderLayers();
  const row = screen.getByText(rectangle.name).closest("[role=treeitem]")!;
  fireEvent.click(row);
  expect(engine.getSnapshot().selection).toEqual([rectangle.id]);
  fireEvent.click(screen.getByText(text.name), { shiftKey: true });
  expect(engine.getSnapshot().selection).toHaveLength(2);
  fireEvent.click(screen.getByText(text.name), { ctrlKey: true });
  expect(engine.getSnapshot().selection).toEqual([rectangle.id]);
  fireEvent.click(screen.getByLabelText("Masquer le calque · Rectangle bleu"));
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(false);
  expect(engine.getSnapshot().selection).toEqual([rectangle.id]);
  fireEvent.click(screen.getByLabelText("Afficher le calque · Rectangle bleu"));
  fireEvent.click(screen.getByLabelText("Verrouiller le calque · Rectangle bleu"));
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
  fireEvent.click(screen.getByLabelText("Déverrouiller le calque · Rectangle bleu"));
  fireEvent.doubleClick(screen.getByText(rectangle.name));
  const input = screen.getByLabelText("Renommer le calque");
  fireEvent.change(input, { target: { value: "Nouveau nom" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.name).toBe("Nouveau nom");
  fireEvent.keyDown(screen.getByText("Nouveau nom").closest("[role=treeitem]")!, { key: "F2" });
  fireEvent.keyDown(screen.getByLabelText("Renommer le calque"), { key: "Escape" });
  expect(screen.queryByLabelText("Renommer le calque")).not.toBeInTheDocument();
  fireEvent.doubleClick(screen.getByText("Nouveau nom"));
  fireEvent.blur(screen.getByLabelText("Renommer le calque"), { target: { value: "Nouveau nom" } });
});
test("supports keyboard selection, context grouping, nested collapse, duplicate and delete", async () => {
  const { engine, rectangle, text } = renderLayers();
  fireEvent.keyDown(screen.getByText(rectangle.name).closest("[role=treeitem]")!, { key: "Enter" });
  fireEvent.keyDown(screen.getByText(text.name).closest("[role=treeitem]")!, {
    key: " ",
    metaKey: true,
  });
  fireEvent.contextMenu(screen.getByText(rectangle.name));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Grouper la sélection" }));
  const group = engine
    .getSnapshot()
    .project.pages[0]!.layers.find((item) => item.kind === "group")!;
  expect(group).toBeDefined();
  const groupRow = screen.getByText(group.name).closest("[role=treeitem]")!;
  fireEvent.click(within(groupRow as HTMLElement).getByRole("button", { name: group.name }));
  expect(screen.queryByText(rectangle.name)).not.toBeInTheDocument();
  fireEvent.click(within(groupRow as HTMLElement).getByRole("button", { name: group.name }));
  expect(screen.getByText(rectangle.name)).toBeInTheDocument();
  fireEvent.contextMenu(screen.getByText(group.name));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dégrouper" }));
  expect(engine.getSnapshot().project.pages[0]!.layers.some((item) => item.kind === "group")).toBe(
    false,
  );
  act(() => engine.select([rectangle.id]));
  expect(screen.queryByLabelText("Monter le calque")).toBeNull();
  expect(screen.queryByLabelText("Descendre le calque")).toBeNull();
  fireEvent.click(screen.getByLabelText("Dupliquer la sélection"));
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(4);
  fireEvent.click(screen.getByLabelText("Supprimer la sélection (1)"));
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
});
test("reorders dragged layers and nests drops onto groups using the center drop zone", () => {
  const { engine, rectangle, text } = renderLayers();
  const data = new Map<string, string>();
  const transfer = {
    setData: vi.fn((key: string, value: string) => data.set(key, value)),
    getData: (key: string) => data.get(key) ?? "",
    effectAllowed: "",
  };
  const source = screen.getByText(rectangle.name).closest("[role=treeitem]")!;
  const target = screen.getByText(text.name).closest("[role=treeitem]")!;
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  expect(target).toHaveClass("drop-after");
  fireEvent.dragLeave(target);
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(transfer.setData).toHaveBeenCalledWith("application/x-musart-layer", rectangle.id);
  const group = createLayer("group", { name: "Dossier" });
  act(() => engine.execute({ type: "addLayers", layers: [group] }));
  const folder = screen.getByText("Dossier").closest("[role=treeitem]")!;
  fireEvent.dragStart(screen.getByText(rectangle.name).closest("[role=treeitem]")!, {
    dataTransfer: transfer,
  });
  const drop = createEvent.drop(folder, { dataTransfer: transfer });
  Object.defineProperty(drop, "shiftKey", { value: true });
  fireEvent(folder, drop);
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === rectangle.id)!
      .parentId,
  ).toBe(group.id);
  fireEvent.drop(folder, { dataTransfer: { ...transfer, getData: () => "" } });
});
test("handles empty trees, orphan depth helper, nested group structure and effect indicator", () => {
  const data = setup();
  const group = createLayer("group", { id: "g" });
  const inner = createLayer("group", { id: "h", parentId: "g" });
  const child = createLayer("rectangle", { parentId: "h" });
  expect(layerDepth(child, [group, inner, child])).toBe(2);
  expect(layerDepth(child, [])).toBe(0);
  expect(flattenLayers([group, inner, child]).map((l) => l.id)).toEqual(["g", "h", child.id]);
  data.engine.execute({ type: "deleteLayers", ids: data.page.layers.map((l) => l.id) });
  data.mount(
    <LayersPanel
      engine={data.engine}
      page={data.engine.getSnapshot().project.pages[0]!}
      project={data.engine.getSnapshot().project}
      selection={[]}
      run={data.run}
    />,
  );
  expect(screen.getByText("Votre prochaine idée commence ici.")).toBeInTheDocument();
});

test("keeps keyboard actions on row controls from changing layer selection", () => {
  const d = renderLayers();
  fireEvent.click(screen.getByText(d.rectangle.name));
  const lock = screen.getByLabelText("Verrouiller le calque · Photo");
  fireEvent.keyDown(lock, { key: "Enter" });
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  fireEvent.click(lock);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.locked).toBe(true);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
});

test("previews inside collapsed groups without removing the dragged row and supports Alt-mask drop", () => {
  const d = renderLayers(),
    group = createLayer("group", { name: "Closed group" });
  act(() => d.engine.execute({ type: "addLayers", layers: [group] }));
  const folder = screen.getByText(group.name).closest("[role=treeitem]")!;
  fireEvent.click(within(folder as HTMLElement).getByRole("button", { name: group.name }));
  expect(folder).toHaveAttribute("aria-expanded", "false");
  const transfer = {
    value: "",
    effectAllowed: "",
    dropEffect: "",
    setData(_key: string, value: string) {
      this.value = value;
    },
    getData() {
      return this.value;
    },
  };
  fireEvent.dragStart(screen.getByText(d.rectangle.name).closest("[role=treeitem]")!, {
    dataTransfer: transfer,
  });
  fireEvent.dragOver(folder, { dataTransfer: transfer });
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(d.rectangle.name)).toBeInTheDocument();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.rectangle.id)!
      .parentId,
  ).toBeNull();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(folder).toHaveAttribute("aria-expanded", "false");
  const target = screen.getByText(d.text.name).closest("[role=treeitem]")!;
  fireEvent.dragStart(screen.getByText(d.rectangle.name).closest("[role=treeitem]")!, {
    dataTransfer: transfer,
  });
  const maskOver = createEvent.dragOver(target, { dataTransfer: transfer });
  Object.defineProperty(maskOver, "altKey", { value: true });
  fireEvent(target, maskOver);
  expect(target).toHaveClass("drop-mask");
  fireEvent.drop(target, { dataTransfer: transfer, altKey: true });
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.text.id)!.mask
      ?.layerId,
  ).toBe(d.rectangle.id);
});

test("mounts only the visible window and overscan for a ten-thousand-layer document", () => {
  const d = setup(),
    layers = Array.from({ length: 10000 }, (_, at) =>
      createLayer("rectangle", { name: `Layer ${at}` }),
    );
  d.engine.execute({ type: "deleteLayers", ids: d.page.layers.map((layer) => layer.id) });
  d.engine.execute({ type: "addLayers", layers });
  const snapshot = d.engine.getSnapshot(),
    page = snapshot.project.pages[0]!;
  d.mount(
    <LayersPanel
      engine={d.engine}
      page={page}
      project={snapshot.project}
      selection={[]}
      run={d.run}
    />,
  );
  const tree = screen.getByRole("tree");
  expect(tree.querySelectorAll("[data-layer-id]").length).toBeLessThan(25);
  expect(tree.querySelector("[data-total-rows]")).toHaveAttribute("data-total-rows", "10001");
  expect(screen.getByText("Layer 9999")).toBeInTheDocument();
  fireEvent.scroll(tree, { target: { scrollTop: 36000 } });
  expect(screen.queryByText("Layer 9999")).toBeNull();
  expect(tree.querySelectorAll("[data-layer-id]").length).toBeLessThan(25);
});
test("all artboards share one tree, independently collapse and activate their real layers", () => {
  const d = renderLayers(),
    other = createPage({ name: "Story", layers: [createLayer("text", { name: "Story title" })] });
  act(() => d.engine.execute({ type: "addPage", page: other }));
  const canonical = d.engine.getSnapshot().project,
    first = canonical.pages[0]!,
    second = canonical.pages[1]!;
  expect(screen.getByText(d.rectangle.name)).toBeInTheDocument();
  expect(screen.getByText("Story title")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `Replier ${first.name}` }));
  expect(screen.queryByText(d.rectangle.name)).toBeNull();
  expect(screen.getByText("Story title")).toBeInTheDocument();
  act(() => d.engine.setPage(first.id));
  fireEvent.click(screen.getByText("Story title"));
  expect(d.engine.getSnapshot()).toMatchObject({
    pageId: second.id,
    selection: [second.layers[0]!.id],
  });
  expect(d.engine.getSnapshot().project).toBe(canonical);
  fireEvent.click(screen.getByRole("treeitem", { name: `${first.name} · 3 calques` }));
  expect(d.engine.getSnapshot()).toMatchObject({ pageId: first.id, selection: [] });
  fireEvent.click(screen.getByRole("button", { name: `Déplier ${first.name}` }));
  expect(screen.getByText(d.rectangle.name)).toBeInTheDocument();
  expect(screen.getAllByRole("tree")).toHaveLength(1);
});
test("page activation and addition preserve the virtual viewport node, native scroll and mounted rows", () => {
  const d = renderLayers(),
    layers = Array.from({ length: 20 }, (_, at) =>
      createLayer("rectangle", { name: `Stack ${at}` }),
    );
  act(() => {
    d.engine.execute({ type: "addLayers", layers });
    d.engine.execute({ type: "addPage", page: createPage({ name: "Other" }) });
  });
  const tree = screen.getByRole("tree") as HTMLElement;
  fireEvent.scroll(tree, { target: { scrollTop: 360 } });
  const retained = tree.querySelector("[data-layer-id]");
  const before = tree.querySelector("[data-total-rows]")!.getAttribute("data-total-rows");
  act(() => d.engine.setPage(d.engine.getSnapshot().project.pages[0]!.id));
  expect(screen.getByRole("tree")).toBe(tree);
  expect(tree.scrollTop).toBe(360);
  expect(retained?.isConnected).toBe(true);
  act(() => d.engine.execute({ type: "addPage", page: createPage({ name: "Third" }) }));
  expect(screen.getByRole("tree")).toBe(tree);
  expect(tree.scrollTop).toBe(360);
  expect(retained?.isConnected).toBe(true);
  expect(Number(tree.querySelector("[data-total-rows]")!.getAttribute("data-total-rows"))).toBe(
    Number(before) + 2,
  );
  expect(tree.querySelectorAll("[data-layer-id]").length).toBeLessThan(25);
});
