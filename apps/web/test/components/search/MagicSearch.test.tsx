import { expect, test, vi } from "vitest";
import { Profiler, StrictMode, type ComponentProps } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createLayer, createPage } from "@musart/core";
import { setup } from "../../support/ui";
import { MagicSearch, type SearchSurface } from "../../../src/components/search/MagicSearch";
import { toolAtom, themeAtom } from "../../../src/state/session/editor";
import { i18n } from "../../../src/state/i18n";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
import {
  importVectorFiles,
  VectorImportError,
} from "../../../src/services/assets/vector/import-files";
const shellRender = vi.hoisted(() => vi.fn());
vi.mock("../../../src/components/search/SearchDialog", async (original) => {
  const actual = await original<typeof import("../../../src/components/search/SearchDialog")>();
  return {
    ...actual,
    SearchDialog(props: ComponentProps<typeof actual.SearchDialog>) {
      shellRender();
      return <actual.SearchDialog {...props} />;
    },
  };
});
vi.mock("../../../src/services/assets/vector/import-files", async (original) => ({
  ...(await original<typeof import("../../../src/services/assets/vector/import-files")>()),
  importVectorFiles: vi.fn().mockResolvedValue(undefined),
}));
test("closed search rerenders only when command availability changes and actions use the latest selection", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  const surface = vi.fn((_props: SearchSurface) => null);
  d.mount(
    <MagicSearch
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={vi.fn()}
      onProjects={vi.fn()}
      onExport={vi.fn()}
      onPanelMode={vi.fn()}
    >
      {surface}
    </MagicSearch>,
  );
  const renders = surface.mock.calls.length;
  const shells = shellRender.mock.calls.length;
  const first = surface.mock.lastCall![0];
  act(() => d.engine.select([d.image.id]));
  expect(surface).toHaveBeenCalledTimes(renders);
  act(() => {
    createCommandPort(d.engine).run("action:delete");
  });
  expect(d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    d.rectangle.id,
    d.text.id,
  ]);
  expect(surface.mock.calls.length).toBeGreaterThan(renders);
  expect(shellRender).toHaveBeenCalledTimes(shells);
  expect(surface.mock.lastCall![0].trigger).toBe(first.trigger);
  expect(surface.mock.lastCall![0].run).toBe(first.run);
});

test("a closed search without a command surface resolves undo availability only when invoked", async () => {
  const { SearchCatalog } = await import("../../../src/components/search/catalog/cache");
  const commands = vi.spyOn(SearchCatalog.prototype, "commandsFor");
  const d = fixture();
  const shells = shellRender.mock.calls.length;
  act(() => d.engine.select([d.rectangle.id]));
  act(() => d.engine.execute({ type: "updatePage", patch: { name: "Latest edit" } }));
  expect(commands).not.toHaveBeenCalled();
  expect(shellRender).toHaveBeenCalledTimes(shells);
  expect(d.engine.getSnapshot().canUndo).toBe(true);
  act(() => {
    expect(createCommandPort(d.engine).run("action:undo")).toBe(true);
  });
  expect(commands).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.name).toBe(d.page.name);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(shellRender).toHaveBeenCalledTimes(shells);
});

test("a retained enabled surface command rechecks availability during its urgent deferred handoff", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  const surface = vi.fn(({ commands, run }: SearchSurface) => (
    <button
      disabled={!!commands.find((item) => item.id === "action:duplicate")?.disabled}
      onClick={() => run("action:duplicate")}
    >
      Duplicate current selection
    </button>
  ));
  let inspectUrgent = false;
  const urgent: { renders: number; disabled: boolean }[] = [];
  d.mount(
    <Profiler
      id="current-command-guard"
      onRender={() => {
        if (!inspectUrgent) return;
        inspectUrgent = false;
        urgent.push({
          renders: surface.mock.calls.length,
          disabled: screen.getByRole<HTMLButtonElement>("button", {
            name: "Duplicate current selection",
          }).disabled,
        });
        surface.mock.lastCall![0].run("action:duplicate");
      }}
    >
      <MagicSearch
        engine={d.engine}
        services={d.services}
        onTask={d.onTask}
        onImport={vi.fn()}
        onProjects={vi.fn()}
        onExport={vi.fn()}
        onPanelMode={vi.fn()}
      >
        {surface}
      </MagicSearch>
    </Profiler>,
  );
  const renders = surface.mock.calls.length;
  const before = d.engine.getSnapshot();
  inspectUrgent = true;
  act(() => d.engine.select([]));
  expect(urgent).toEqual([{ renders, disabled: false }]);
  expect(surface).toHaveBeenCalledTimes(renders + 1);
  expect(screen.getByRole("button", { name: "Duplicate current selection" })).toBeDisabled();
  expect(d.onTask).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().revision).toBe(before.revision);
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().selection).toEqual([]);
});

test("typing in search does not rebuild the independent command surface", async () => {
  const d = setup();
  const surface = vi.fn(({ trigger }: SearchSurface) => trigger);
  d.mount(
    <MagicSearch
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={vi.fn()}
      onProjects={vi.fn()}
      onExport={vi.fn()}
      onPanelMode={vi.fn()}
    >
      {surface}
    </MagicSearch>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rechercher dans Melt" }));
  const input = await screen.findByRole("combobox");
  const renders = surface.mock.calls.length,
    shells = shellRender.mock.calls.length;
  fireEvent.change(input, { target: { value: "baguette" } });
  expect(await screen.findByRole("option", { name: /Baguette magique/ })).toBeVisible();
  expect(surface).toHaveBeenCalledTimes(renders);
  expect(shellRender).toHaveBeenCalledTimes(shells);
});
function fixture(strict = false) {
  const d = setup();
  const onImport = vi.fn(),
    onProjects = vi.fn(),
    onExport = vi.fn(),
    onPanelMode = vi.fn();
  const search = (
    <MagicSearch
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={onImport}
      onProjects={onProjects}
      onExport={onExport}
      onPanelMode={onPanelMode}
    />
  );
  d.mount(strict ? <StrictMode>{search}</StrictMode> : search);
  const open = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rechercher dans Melt" }));
    await screen.findByRole("dialog", { name: "Rechercher dans Melt" });
    return screen.getByRole("combobox");
  };
  const choose = async (query: string, name: RegExp | string) => {
    const previousTasks = d.onTask.mock.calls.length;
    const input = await open();
    fireEvent.change(input, { target: { value: query } });
    fireEvent.click(await screen.findByRole("option", { name }));
    await waitFor(() =>
      expect(document.querySelector("[data-magic-search]")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(d.onTask.mock.calls.length).toBeGreaterThan(previousTasks));
  };
  return { ...d, onImport, onProjects, onExport, onPanelMode, open, choose };
}
test("shared quick actions reject a deferred callback after a project replacement", () => {
  const d = fixture();
  act(() => d.engine.select([d.rectangle.id]));
  let queued!: () => void | Promise<void>;
  d.onTask.mockImplementationOnce(async (action) => {
    queued = action;
    return true;
  });
  const port = createCommandPort(d.engine);
  expect(port.run("action:delete")).toBe(true);
  const replacement = structuredClone(d.project);
  replacement.id = "replacement-quick-action";
  act(() => d.engine.load(replacement));
  const untouched = d.engine.getSnapshot();
  expect(() => queued()).toThrow("Le document a changé");
  expect(d.engine.getSnapshot()).toBe(untouched);
});
test("opens from the top-left trigger and Cmd/Ctrl K, searches localized tools and executes with Enter", async () => {
  const d = fixture();
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  const dialog = await screen.findByRole("dialog", { name: "Rechercher dans Melt" });
  expect(dialog).toHaveAccessibleDescription(
    "Trouvez un outil, un calque, une page ou une action.",
  );
  const input = screen.getByRole("combobox");
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Édition" }));
  fireEvent.click(screen.getByRole("button", { name: "Tout" }));
  fireEvent.change(input, { target: { value: "baguette" } });
  const option = await screen.findByRole("option", { name: /Baguette magique/ });
  await waitFor(() => expect(option).toHaveAttribute("data-selected", "true"));
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(d.store.get(toolAtom)).toBe("wand"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rechercher dans Melt" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  await screen.findByRole("combobox");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "k", ctrlKey: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("browses categories, reports empty searches and disables commands requiring a selection", async () => {
  const d = fixture(),
    input = await d.open();
  expect(screen.queryByText("Choisissez une catégorie pour en voir plus.")).not.toBeInTheDocument();
  expect(document.querySelector(".magic-search-footer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Édition" }));
  const duplicate = screen.getByRole("option", { name: /Dupliquer/ });
  expect(duplicate).toHaveAttribute("aria-disabled", "true");
  expect(duplicate).toHaveAttribute(
    "aria-description",
    "Sélectionnez d’abord un calque déverrouillé",
  );
  fireEvent.click(duplicate);
  expect(d.engine.getSnapshot().revision).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Calques" }));
  expect(screen.getAllByRole("option")).toHaveLength(3);
  fireEvent.change(input, { target: { value: "zzzz-nothing" } });
  expect(
    await screen.findByText("Aucun résultat. Essayez un autre mot ou une autre catégorie."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("selects cross-page layers and pages, and adds an effect as a single undoable transaction", async () => {
  const d = fixture(),
    layer = createLayer("text", { name: "Été à Paris", text: "Couverture" });
  const page = createPage({ name: "Story", layers: [layer] });
  act(() => d.engine.execute({ type: "addPage", page }));
  const revision = d.engine.getSnapshot().revision;
  await d.choose("ete paris", /Été à Paris/);
  expect(d.engine.getSnapshot()).toMatchObject({
    pageId: page.id,
    selection: [layer.id],
    revision,
  });
  await d.choose("dither", /Dither/i);
  expect(d.engine.getSnapshot().project.pages[1]!.layers[0]!.effects[0]?.type).toBe("dither");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[1]!.layers[0]!.effects).toEqual([]);
  const input = await d.open();
  fireEvent.click(screen.getByRole("button", { name: "Pages" }));
  fireEvent.change(input, { target: { value: "Affiche" } });
  fireEvent.click(screen.getByRole("option", { name: /Affiche/ }));
  await waitFor(() => expect(d.engine.getSnapshot().pageId).toBe(d.page.id));
});

test("keyboard palette focus survives StrictMode cleanup, returns to its origin and exiting results cannot dispatch stale commands", async () => {
  const d = fixture(true),
    origin = document.createElement("button");
  origin.textContent = "Canvas focus origin";
  document.body.append(origin);
  origin.focus();
  fireEvent.keyDown(origin, { key: "k", ctrlKey: true });
  const input = await screen.findByRole("combobox");
  expect(input).toHaveFocus();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(input).toHaveFocus();
  const option = screen
    .getAllByRole("option")
    .find((item) => item.getAttribute("aria-disabled") !== "true")!;
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(option.closest("[inert]")).not.toBeNull();
  fireEvent.click(option);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.onTask).not.toHaveBeenCalled();
  await waitFor(() => expect(document.querySelector("[data-magic-search]")).toBeNull());
  await waitFor(() => expect(origin).toHaveFocus());
  expect(screen.getByRole("button", { name: "Rechercher dans Melt" })).not.toHaveFocus();
  origin.remove();
});
test("hands off image imports and dialogs after closing", async () => {
  const d = fixture();
  d.onExport.mockImplementation(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await d.choose("png", /Exporter/);
  expect(d.onExport).toHaveBeenCalledOnce();
  await d.choose("new project", /Nouveau projet/);
  expect(d.onProjects).toHaveBeenLastCalledWith("newProject");
  await d.choose("animate", /Exporter un timelapse de création/);
  expect(d.onPanelMode).toHaveBeenLastCalledWith("animate");
  await d.choose("import images", /Importer des images/);
  expect(d.onImport).toHaveBeenCalledOnce();
});
test("uses native SVG/portable inputs and reports service failures through the task runner", async () => {
  const d = fixture();
  const svgInput = screen.getByLabelText("Importer un SVG", { selector: "input" });
  const svgClick = vi.spyOn(svgInput, "click");
  await d.choose("svg", /^Importer un SVG/);
  expect(svgClick).toHaveBeenCalledOnce();
  const svg = new File(["<svg/>"], "shape.svg", { type: "image/svg+xml" });
  fireEvent.change(svgInput, { target: { files: [svg] } });
  await waitFor(() => expect(importVectorFiles).toHaveBeenCalledWith(d.engine, [svg]));
  fireEvent.change(svgInput, { target: { files: [] } });
  vi.mocked(importVectorFiles).mockRejectedValueOnce(
    new VectorImportError("invalid", "broken.svg"),
  );
  fireEvent.change(svgInput, { target: { files: [svg] } });
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
  vi.mocked(importVectorFiles).mockRejectedValueOnce(new Error("Unexpected failure"));
  fireEvent.change(svgInput, { target: { files: [svg] } });
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
  const portableInput = screen.getByLabelText("Ouvrir un projet .musart", { selector: "input" });
  const portableClick = vi.spyOn(portableInput, "click");
  await d.choose("musart", /^Ouvrir un projet/);
  expect(portableClick).toHaveBeenCalledOnce();
  const file = new File(["{}"], "sample.musart");
  fireEvent.change(portableInput, { target: { files: [file] } });
  await waitFor(() => expect(d.services.openPortable).toHaveBeenCalledWith(file));
  fireEvent.change(portableInput, { target: { files: [] } });
  vi.mocked(d.services.saveProject).mockRejectedValueOnce(new Error("Quota exceeded"));
  await d.choose("save", /^Enregistrer/);
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
});
test("switches appearance/language and opens real keyboard help from search or ?", async () => {
  const d = fixture();
  await d.choose("dark theme", /thème sombre/);
  expect(d.store.get(themeAtom)).toBe("dark");
  await d.choose("language english", /Switch to English/);
  expect(i18n.language).toBe("en");
  await act(() => i18n.changeLanguage("fr"));
  await d.choose("shortcuts", /Raccourcis clavier/);
  const help = await screen.findByRole("dialog", { name: "Raccourcis clavier" });
  expect(within(help).getByText("Enregistrer")).toBeInTheDocument();
  fireEvent.click(within(help).getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.keyDown(document, { key: "?" });
  expect(await screen.findByRole("dialog", { name: "Raccourcis clavier" })).toBeInTheDocument();
});

test("the closed spotlight never scores document rows during selection updates", async () => {
  const module = await import("../../../src/components/search/catalog/search"),
    score = vi.spyOn(module, "searchItems");
  const d = fixture();
  expect(score).not.toHaveBeenCalled();
  act(() => d.engine.select([d.rectangle.id]));
  act(() => d.engine.select([d.text.id]));
  expect(score).not.toHaveBeenCalled();
  await d.open();
  expect(score).toHaveBeenCalled();
  score.mockRestore();
});

test("closed selection updates never build or normalize the document catalog", async () => {
  const { SearchCatalog } = await import("../../../src/components/search/catalog/cache"),
    search = await import("../../../src/components/search/catalog/search"),
    read = vi.spyOn(SearchCatalog.prototype, "read"),
    prepare = vi.spyOn(search, "prepareSearchItems");
  const d = fixture();
  act(() => d.engine.select([d.rectangle.id]));
  act(() => d.engine.select([d.text.id]));
  expect(read).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  await d.open();
  expect(read).toHaveBeenCalled();
  expect(prepare).toHaveBeenCalled();
});

test("opening focuses the input once without scrolling its surrounding viewport", async () => {
  const focus = vi.spyOn(HTMLElement.prototype, "focus"),
    d = fixture();
  const input = await d.open();
  const calls = focus.mock.contexts.flatMap((context, index) =>
    context === input ? [focus.mock.calls[index]] : [],
  );
  expect(calls).toEqual([[{ preventScroll: true }]]);
  expect(input).toHaveFocus();
});
