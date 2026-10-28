import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createLayer, createPage } from "@musart/core";
import { setup } from "../../support/ui";
import { MagicSearch } from "../../../src/components/search/MagicSearch";
import { toolAtom, themeAtom } from "../../../src/state/session/editor";
import { i18n } from "../../../src/state/i18n";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
import {
  importVectorFiles,
  VectorImportError,
} from "../../../src/services/assets/vector/import-files";
vi.mock("../../../src/services/assets/vector/import-files", async (original) => ({
  ...(await original<typeof import("../../../src/services/assets/vector/import-files")>()),
  importVectorFiles: vi.fn().mockResolvedValue(undefined),
}));
function fixture() {
  const d = setup();
  const onImport = vi.fn(),
    onProjects = vi.fn(),
    onExport = vi.fn(),
    onPanelMode = vi.fn();
  d.mount(
    <MagicSearch
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={onImport}
      onProjects={onProjects}
      onExport={onExport}
      onPanelMode={onPanelMode}
    />,
  );
  const open = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rechercher dans MusArt" }));
    await screen.findByRole("dialog", { name: "Rechercher dans MusArt" });
    return screen.getByRole("combobox");
  };
  const choose = async (query: string, name: RegExp | string) => {
    const input = await open();
    fireEvent.change(input, { target: { value: query } });
    fireEvent.click(await screen.findByRole("option", { name }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Rechercher dans MusArt" }),
      ).not.toBeInTheDocument(),
    );
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
  const dialog = await screen.findByRole("dialog", { name: "Rechercher dans MusArt" });
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
  expect(screen.getByRole("button", { name: "Rechercher dans MusArt" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  await screen.findByRole("combobox");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "k", ctrlKey: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("browses categories, reports empty searches and disables commands requiring a selection", async () => {
  const d = fixture(),
    input = await d.open();
  expect(screen.getByText("Choisissez une catégorie pour en voir plus.")).toBeInTheDocument();
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
test("hands off image imports and dialogs after closing", async () => {
  const d = fixture();
  d.onExport.mockImplementation(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await d.choose("png", /Exporter/);
  expect(d.onExport).toHaveBeenCalledOnce();
  await d.choose("new project", /Nouveau projet/);
  expect(d.onProjects).toHaveBeenLastCalledWith("newProject");
  await d.choose("animate", /Ouvrir Animate/);
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
