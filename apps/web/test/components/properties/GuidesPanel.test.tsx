import { beforeEach, afterEach, expect, test } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { previewAtom } from "../../../src/state/session/editor";
import { GuidesPanel } from "../../../src/components/properties/GuidesPanel";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { DEFAULT_GUIDE_COLOR, GUIDE_COLOR_KEY } from "../../../src/state/guides/colors";
beforeEach(() => localStorage.setItem(GUIDE_COLOR_KEY, DEFAULT_GUIDE_COLOR));
afterEach(() => localStorage.removeItem(GUIDE_COLOR_KEY));
test("a retained guide-color portal rejects previews and commits once its Inspector target is stale", () => {
  const d = setup();
  d.engine.execute({
    type: "addGuide",
    targetId: d.rectangle.id,
    guide: { id: "retained", axis: "x", position: 20 },
  });
  d.engine.select([d.rectangle.id]);
  const page = d.engine.getSnapshot().project.pages[0]!;
  d.mount(
    <GuidesPanel
      engine={d.engine}
      page={page}
      layer={page.layers[0]!}
      run={d.run}
      canEdit={() => d.engine.getSnapshot().selection[0] === d.rectangle.id}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Couleur du repère" }));
  const input = screen.getByLabelText("Couleur hexadécimale");
  act(() => d.engine.select([d.image.id]));
  const original = d.engine.getSnapshot();
  fireEvent.change(input, { target: { value: "#ffaa00" } });
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.blur(input);
  expect(d.engine.getSnapshot()).toBe(original);
});
test("guide colors preview without edits, commit once and become the next guide's default", () => {
  const d = setup();
  d.engine.execute({ type: "addGuide", guide: { id: "colored", axis: "x", position: 20 } });
  function Live() {
    const s = useEngine(d.engine);
    return <GuidesPanel engine={d.engine} page={s.project.pages[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Couleur du repère" }));
  const input = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(input, { target: { value: "#00aaff" } });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { guides: [{ id: "colored", color: "#00aaff" }] },
  });
  fireEvent.blur(input);
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.color).toBe("#00aaff");
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter horizontal" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides[1]!.color).toBe("#00aaff");
  act(() => {
    d.engine.undo();
    d.engine.undo();
  });
  expect(d.engine.getSnapshot().project).toBe(before.project);
});
test("manages page guides and rulers through undoable commands", () => {
  const d = setup();
  function Live() {
    const s = useEngine(d.engine);
    return <GuidesPanel engine={d.engine} page={s.project.pages[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  expect(screen.getByLabelText("Afficher les règles")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Afficher les règles"));
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter vertical" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter horizontal" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("X1"), { target: { value: "200" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: {
      guides: expect.arrayContaining([expect.objectContaining({ axis: "x", position: 200 })]),
    },
  });
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(540);
  fireEvent.blur(screen.getByLabelText("X1"));
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(200);
  fireEvent.click(screen.getAllByLabelText("Supprimer le repère")[0]!);
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Effacer les repères" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(0);
});

test("a retained Inspector page observes current rulers and keeps canonical guide previews editable", () => {
  const d = setup();
  d.engine.execute({ type: "addGuide", guide: { id: "live", axis: "x", position: 80 } });
  const page = d.engine.getSnapshot().project.pages[0]!;
  d.mount(<GuidesPanel engine={d.engine} page={page} run={d.run} />);
  const position = screen.getByLabelText("X1");
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(screen.getByLabelText("Afficher les règles")).toBeChecked();
  expect(screen.getByLabelText("X1")).toBe(position);
  const before = d.engine.getSnapshot();
  fireEvent.change(position, { target: { value: "155" } });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { guides: [{ id: "live", axis: "x", position: 155 }] },
  });
  fireEvent.blur(position);
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(155);
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(80);
});
test("keeps selected-layer guides separate from composition guides", () => {
  const d = setup();
  d.engine.execute({ type: "addGuide", guide: { id: "page-guide", axis: "x", position: 80 } });
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return <GuidesPanel engine={d.engine} page={page} layer={page.layers[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  expect(screen.queryByLabelText("X1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter vertical" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.guides).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("X1"), { target: { value: "125" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layer",
    layerId: d.rectangle.id,
    patch: { guides: [expect.objectContaining({ position: 125 })] },
  });
  fireEvent.keyDown(screen.getByLabelText("X1"), { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toEqual([
    { id: "page-guide", axis: "x", position: 80 },
  ]);
  expect(screen.queryByLabelText("Afficher les règles")).toBeNull();
});

test("social presets append to existing guides in one undoable transaction and never resize the target", () => {
  const d = setup();
  d.engine.execute({ type: "addGuide", guide: { id: "existing", axis: "x", position: 45 } });
  const original = d.engine.getSnapshot().project.pages[0]!;
  function Live() {
    const state = useEngine(d.engine);
    return <GuidesPanel engine={d.engine} page={state.project.pages[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Modèles" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter les repères Story Instagram" }));
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.guides).toHaveLength(5);
  expect(page.guides[0]).toEqual(original.guides[0]);
  expect([page.width, page.height]).toEqual([1080, 1080]);
  expect(screen.getByText("Verticaux")).toBeVisible();
  expect(screen.getByText("Horizontaux")).toBeVisible();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toEqual(original.guides);
});
test("a deferred preset append rejects a replaced project and locked targets remain inert", () => {
  const d = setup();
  let pending: (() => void) | undefined;
  d.run.mockImplementation((action) => {
    pending = action;
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const view = d.mount(<GuidesPanel engine={d.engine} page={page} run={d.run} />);
  fireEvent.click(screen.getByRole("button", { name: "Modèles" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Ajouter les repères Publication Instagram" }),
  );
  act(() => d.engine.load(d.project));
  const untouched = d.engine.getSnapshot();
  act(() => pending!());
  expect(d.engine.getSnapshot()).toBe(untouched);
  view.unmount();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
  const current = d.engine.getSnapshot().project.pages[0]!;
  d.mount(<GuidesPanel engine={d.engine} page={current} layer={current.layers[0]!} run={d.run} />);
  expect(screen.getByRole("button", { name: "Modèles" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ajouter vertical" })).toBeDisabled();
});
