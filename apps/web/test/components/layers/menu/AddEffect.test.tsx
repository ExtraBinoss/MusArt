import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { AddEffect } from "../../../../src/components/layers/menu/AddEffect";
import { setup } from "../../../support/ui";
import { i18n } from "../../../../src/state/i18n";
import {
  createLayer,
  createPage,
  createProject,
  getEffectDefinition,
  EFFECT_CATALOG,
} from "@musart/core";

test.each(["effect", "adjustment"] as const)(
  "%s menu sorts localized labels and updates its order while open",
  async (category) => {
    const d = setup();
    d.engine.select([d.rectangle.id]);
    d.mount(
      <AddEffect
        engine={d.engine}
        page={d.page}
        selection={[d.rectangle.id]}
        run={d.run}
        category={category}
      />,
    );
    fireEvent.pointerDown(
      screen.getByLabelText(i18n.t(category === "effect" ? "addEffect" : "addAdjustment")),
      { button: 0, ctrlKey: false },
    );
    try {
      for (const language of ["fr", "en"]) {
        await act(async () => {
          await i18n.changeLanguage(language);
        });
        const items = await screen.findAllByRole("menuitem");
        const labels = items.map((node) => node.textContent!.trim());
        expect(labels).toHaveLength(
          Object.values(EFFECT_CATALOG).filter((e) => e.category === category).length,
        );
        expect(labels).toEqual(
          [...labels].sort((a, b) =>
            a.localeCompare(b, language, { sensitivity: "base", numeric: true }),
          ),
        );
      }
      expect(d.engine.getSnapshot().canUndo).toBe(false);
    } finally {
      await act(async () => {
        await i18n.changeLanguage("fr");
      });
    }
  },
);
test("visible effect and correction buttons list real categories and apply to actual selection", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.text.id]);
  d.mount(
    <>
      <AddEffect
        engine={d.engine}
        page={d.engine.getSnapshot().project.pages[0]!}
        selection={[d.rectangle.id, d.text.id]}
        run={d.run}
        category="effect"
      />
      <AddEffect
        engine={d.engine}
        page={d.engine.getSnapshot().project.pages[0]!}
        selection={[]}
        run={d.run}
        category="adjustment"
      />
    </>,
  );
  expect(screen.getByLabelText("Ajouter un réglage")).toBeDisabled();
  fireEvent.pointerDown(screen.getByLabelText("Ajouter un effet"), { button: 0, ctrlKey: false });
  expect(await screen.findByRole("menuitem", { name: "Flou" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Luminosité" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Flou" }));
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((l) => l.effects[0]?.type === "blur"),
  ).toBe(true);
  d.engine.undo();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("stable parent props skip effect-control renders while selection, category, handlers and language remain live", async () => {
  history.replaceState({}, "", "/?automation=1");
  const d = setup();
  let snapshot = d.engine.getSnapshot();
  const props = {
    engine: d.engine,
    page: snapshot.project.pages[0]!,
    selection: snapshot.selection,
    run: d.run,
    category: "effect" as const,
  };
  const view = d.mount(<AddEffect {...props} />),
    trigger = screen.getByLabelText("Ajouter un effet");
  const initial = trigger.dataset.reactRenders;
  view.rerender(<AddEffect {...props} />);
  view.rerender(<AddEffect {...props} />);
  expect(trigger.dataset.reactRenders).toBe(initial);
  expect(trigger).toBeDisabled();
  act(() => d.engine.select([d.rectangle.id]));
  snapshot = d.engine.getSnapshot();
  const run = vi.fn((task: () => void) => task());
  const selected = { ...props, selection: snapshot.selection, run };
  view.rerender(<AddEffect {...selected} category="adjustment" />);
  expect(screen.getByLabelText("Ajouter un réglage")).toBeEnabled();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Luminosité" }));
  expect(run).toHaveBeenCalledOnce();
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.type).toBe("brightness");
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  snapshot = d.engine.getSnapshot();
  view.rerender(
    <AddEffect {...selected} page={snapshot.project.pages[0]!} category="adjustment" />,
  );
  expect(trigger).toBeDisabled();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByLabelText("Add adjustment")).toBe(trigger);
  await act(async () => {
    await i18n.changeLanguage("fr");
  });
  history.replaceState({}, "", "/");
});

test("closed catalog skips option translation and opens with fresh page, selection, language and action handlers", async () => {
  const d = setup(),
    translate = vi.spyOn(i18n, "t");
  const optionKey = getEffectDefinition("blur").nameKey;
  const optionCalls = () => translate.mock.calls.filter(([key]) => key === optionKey);
  d.engine.select([d.rectangle.id]);
  const view = d.mount(
    <AddEffect
      engine={d.engine}
      page={d.engine.getSnapshot().project.pages[0]!}
      selection={[d.rectangle.id]}
      run={d.run}
      category="effect"
    />,
  );
  try {
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(optionCalls()).toHaveLength(0);
    act(() => {
      d.engine.load(
        createProject({
          pages: [
            createPage({ id: "first", layers: [createLayer("rectangle", { id: "untouched" })] }),
            createPage({
              id: "second",
              layers: [
                createLayer("ellipse", { id: "current" }),
                createLayer("rectangle", { id: "other" }),
              ],
            }),
          ],
        }),
      );
      d.engine.setPage("second");
      d.engine.select(["current"]);
    });
    const run = vi.fn((task: () => void) => task()),
      snapshot = d.engine.getSnapshot();
    view.rerender(
      <AddEffect
        engine={d.engine}
        page={snapshot.project.pages[1]!}
        selection={snapshot.selection}
        run={run}
        category="effect"
      />,
    );
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(screen.getByLabelText("Add effect")).toBeEnabled();
    expect(optionCalls()).toHaveLength(0);
    fireEvent.pointerDown(screen.getByLabelText("Add effect"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Blur" }));
    expect(optionCalls().length).toBeGreaterThan(0);
    expect(run).toHaveBeenCalledOnce();
    expect(d.run).not.toHaveBeenCalled();
    const pages = d.engine.getSnapshot().project.pages;
    expect(pages[0]!.layers[0]!.effects).toEqual([]);
    expect(pages[1]!.layers[0]!.effects.map((effect) => effect.type)).toEqual(["blur"]);
    expect(pages[1]!.layers[1]!.effects).toEqual([]);
    const tasks: (() => void)[] = [],
      deferred = vi.fn((task: () => void) => tasks.push(task));
    const current = d.engine.getSnapshot();
    view.rerender(
      <AddEffect
        engine={d.engine}
        page={current.project.pages[1]!}
        selection={current.selection}
        run={deferred}
        category="adjustment"
      />,
    );
    fireEvent.pointerDown(screen.getByLabelText("Add adjustment"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Brightness" }));
    expect(deferred).toHaveBeenCalledOnce();
    act(() => d.engine.select(["other"]));
    const stale = d.engine.getSnapshot();
    act(() => tasks[0]!());
    expect(d.engine.getSnapshot()).toBe(stale);
  } finally {
    translate.mockRestore();
    await act(async () => {
      await i18n.changeLanguage("fr");
    });
  }
});
