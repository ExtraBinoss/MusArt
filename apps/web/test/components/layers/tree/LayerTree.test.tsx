import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer, createPage } from "@musart/core";
import { LayerTree } from "../../../../src/components/layers/tree/LayerTree";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

test("native DOM movement cannot lose focus on an unchanged logical row", () => {
  const data = setup();
  act(() =>
    data.engine.execute({
      type: "addLayers",
      layers: Array.from({ length: 100 }, (_, at) =>
        createLayer("rectangle", { id: `focus-${at}`, name: `Focus ${at}` }),
      ),
    }),
  );
  function Live() {
    const snapshot = useEngine(data.engine);
    return (
      <LayerTree
        engine={data.engine}
        project={snapshot.project}
        page={snapshot.project.pages[0]!}
        selection={snapshot.selection}
        attachment={null}
        run={data.run}
      />
    );
  }
  data.mount(<Live />);
  const tree = screen.getByRole("tree");
  fireEvent.scroll(tree, { target: { scrollTop: 360 } });
  const button = tree.querySelector<HTMLButtonElement>(
    '[data-layer-id="focus-89"] .layer-actions button',
  )!;
  button.focus();
  const insert = Element.prototype.insertBefore;
  const moves = vi.spyOn(Element.prototype, "insertBefore").mockImplementation(function <
    T extends Node,
  >(this: Element, node: T, before: Node | null): T {
    const focused = document.activeElement;
    const result = insert.call(this, node, before) as T;
    if (focused instanceof HTMLElement && node instanceof Element && node.contains(focused))
      focused.blur();
    return result;
  });
  fireEvent.scroll(tree, { target: { scrollTop: 180 } });
  expect(document.activeElement).toBe(button);
  expect(tree.scrollTop).toBe(180);
  moves.mockRestore();
});

test("scroll owns the bounded window while page replacement and empty artboards remain live", () => {
  const data = setup();
  let parentRenders = 0;
  function Live() {
    parentRenders++;
    const snapshot = useEngine(data.engine);
    return (
      <LayerTree
        engine={data.engine}
        project={snapshot.project}
        page={snapshot.project.pages.find((page) => page.id === snapshot.pageId)!}
        selection={snapshot.selection}
        attachment={null}
        run={data.run}
      />
    );
  }
  data.mount(<Live />);
  act(() =>
    data.engine.execute({
      type: "addLayers",
      layers: Array.from({ length: 150 }, (_, index) =>
        createLayer("rectangle", { name: `Scrollable ${index}` }),
      ),
    }),
  );
  const tree = screen.getByRole("tree"),
    before = parentRenders;
  for (const top of [360, 720, 1080]) fireEvent.scroll(tree, { target: { scrollTop: top } });
  expect(parentRenders).toBe(before);
  expect(tree.querySelectorAll("[data-layer-id]").length).toBeLessThanOrEqual(20);
  expect(tree.querySelector(".layer-tree-window")).toHaveAttribute("data-total-rows", "154");
  const empty = createPage({ name: "Empty replacement" });
  act(() => data.engine.execute({ type: "addPage", page: empty }));
  expect(screen.getByRole("tree")).toBe(tree);
  expect(tree.querySelector(".layer-tree-window")).toHaveAttribute("data-total-rows", "156");
  fireEvent.scroll(tree, { target: { scrollTop: 100000 } });
  expect(tree.querySelector(`[data-artboard-id="${empty.id}"]`)).toBeInTheDocument();
  expect(tree.querySelector(`[data-layer-tree-key="empty:${empty.id}"]`)).toBeInTheDocument();
});
