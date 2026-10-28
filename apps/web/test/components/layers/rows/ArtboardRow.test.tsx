import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createPage } from "@musart/core";
import { ArtboardRow } from "../../../../src/components/layers/rows/ArtboardRow";
import { setup } from "../../../support/ui";
test("artboard roots activate by pointer or keyboard and collapse without editing the project", () => {
  const d = setup();
  d.engine.execute({ type: "addPage", page: createPage({ name: "Story" }) });
  d.engine.load(d.engine.getSnapshot().project);
  const page = d.engine.getSnapshot().project.pages[1]!,
    onToggle = vi.fn();
  d.engine.setPage(d.engine.getSnapshot().project.pages[0]!.id);
  const view = d.mount(
    <ArtboardRow
      engine={d.engine}
      page={page}
      active={false}
      expanded
      top={0}
      onToggle={onToggle}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Replier Story" }));
  expect(onToggle).toHaveBeenCalledWith(page.id);
  expect(d.engine.getSnapshot().pageId).not.toBe(page.id);
  fireEvent.click(screen.getByRole("treeitem"));
  expect(d.engine.getSnapshot().pageId).toBe(page.id);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: "ArrowLeft" });
  expect(onToggle).toHaveBeenCalledTimes(2);
  view.rerender(
    <ArtboardRow
      engine={d.engine}
      page={page}
      active
      expanded={false}
      top={0}
      onToggle={onToggle}
    />,
  );
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: "ArrowRight" });
  expect(onToggle).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("treeitem")).toHaveAttribute(
    "data-layer-tree-key",
    `artboard:${page.id}`,
  );
  expect(
    screen.getByRole("button", { name: "Déplier Story" }).querySelector("svg"),
  ).toHaveAttribute("data-expanded", "false");
  act(() => d.engine.load(d.project));
  const replacement = d.engine.getSnapshot();
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: "Enter" });
  expect(d.engine.getSnapshot()).toBe(replacement);
});
