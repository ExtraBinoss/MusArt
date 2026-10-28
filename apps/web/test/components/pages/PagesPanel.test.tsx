import { afterEach, expect, test, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { PagesPanel } from "../../../src/components/pages/PagesPanel";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
let reducedMotion = false;
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => reducedMotion,
}));
afterEach(() => {
  reducedMotion = false;
});
test("creates, switches and deletes compositions through the engine", () => {
  const { mount, engine, page, run } = setup();
  function Live() {
    const s = useEngine(engine);
    return (
      <PagesPanel
        engine={engine}
        page={s.project.pages.find((p) => p.id === s.pageId)!}
        pages={s.project.pages}
        run={run}
      />
    );
  }
  mount(<Live />);
  expect(screen.queryByLabelText("Supprimer la composition")).toBeNull();
  fireEvent.click(screen.getByLabelText("Ajouter une composition"));
  expect(engine.getSnapshot().project.pages).toHaveLength(2);
  const added = engine.getSnapshot().project.pages[1]!;
  fireEvent.mouseDown(screen.getByRole("tab", { name: page.name }), { button: 0, ctrlKey: false });
  expect(engine.getSnapshot().pageId).toBe(page.id);
  fireEvent.mouseDown(screen.getByRole("tab", { name: added.name }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByLabelText("Supprimer la composition"));
  expect(engine.getSnapshot().project.pages).toHaveLength(1);
});

test("keeps one decorative active indicator and accessible tabs with reduced motion", () => {
  reducedMotion = true;
  const { mount, engine, page, run } = setup();
  function Live() {
    const state = useEngine(engine);
    return (
      <PagesPanel
        engine={engine}
        page={state.project.pages.find((item) => item.id === state.pageId)!}
        pages={state.project.pages}
        run={run}
      />
    );
  }
  const { container } = mount(<Live />);
  expect(screen.getByRole("tab", { name: page.name })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByLabelText("Ajouter une composition"));
  const added = engine.getSnapshot().project.pages[1]!;
  expect(screen.getByRole("tab", { name: added.name })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: page.name })).toHaveAttribute("aria-selected", "false");
  const indicators = container.querySelectorAll(".page-tab-indicator");
  expect(indicators).toHaveLength(1);
  expect(indicators[0]).toHaveAttribute("aria-hidden", "true");
  expect(indicators[0]).not.toHaveAttribute("tabindex");
});
