import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { Layer } from "@musart/core";
import { FONT_CATALOG, MAX_FONT_FILE_BYTES } from "@musart/assets";
import type { FontDefinition } from "@musart/assets";
import type { FontLibraryPort } from "../../../../src/services/fonts/model";
import { FontLibraryProvider } from "../../../../src/components/properties/fonts/library-context";
import { FontPicker } from "../../../../src/components/properties/fonts/FontPicker";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
afterEach(() => localStorage.removeItem("musart.fonts.recent"));

function mount(locked = false, library?: FontLibraryPort) {
  localStorage.removeItem("musart.fonts.recent");
  const data = setup();
  if (locked) {
    data.engine.execute({ type: "updateLayers", ids: [data.text.id], patch: { locked } });
    data.engine.load(data.engine.getSnapshot().project);
  }
  const changed = vi.fn(),
    parentRenders = vi.fn();
  data.engine.subscribe(changed);
  function Live() {
    parentRenders();
    const state = useEngine(data.engine),
      layer = state.project.pages[0]!.layers.find((item) => item.id === data.text.id)!;
    return (
      <>
        <button>Outside</button>
        <FontPicker
          layer={layer}
          patch={(patch: Partial<Layer>) => {
            data.store.set(previewAtom, null);
            data.engine.execute({ type: "updateLayers", ids: [layer.id], patch });
          }}
          preview={(patch: Partial<Layer>) =>
            data.store.set(previewAtom, { target: "layer", layerId: layer.id, patch })
          }
          cancel={() => data.store.set(previewAtom, null)}
        />
      </>
    );
  }
  const view = data.mount(
    library ? (
      <FontLibraryProvider library={library}>
        <Live />
      </FontLibraryProvider>
    ) : (
      <Live />
    ),
  );
  return {
    ...data,
    view,
    changed,
    parentRenders,
    layer: () =>
      data.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === data.text.id)!,
  };
}

function open() {
  fireEvent.click(screen.getByRole("combobox", { name: "Police" }));
}
function search(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Rechercher une police" }), {
    target: { value },
  });
}

test("virtualizes fonts, previews hover without parent/document commits and applies one undoable choice", async () => {
  const data = mount();
  open();
  expect(screen.getAllByRole("option").length).toBeLessThan(FONT_CATALOG.length);
  expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(10);
  fireEvent.pointerOver(screen.getByRole("option", { name: "Tinos" }));
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: "Tinos" } });
  expect(data.layer().fontFamily).toBe("Inter");
  expect(data.changed).not.toHaveBeenCalled();
  expect(data.parentRenders).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("option", { name: "Tinos" }));
  expect(data.layer().fontFamily).toBe("Tinos");
  expect(data.changed).toHaveBeenCalledOnce();
  expect(data.store.get(previewAtom)).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
  act(() => data.engine.undo());
  expect(data.layer().fontFamily).toBe("Inter");
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  open();
  const recents = screen.getByRole("group", { name: "Récentes" });
  expect(within(recents).getByRole("button", { name: "Tinos" })).toBeVisible();
});

function platform(overrides: Partial<FontLibraryPort> = {}): FontLibraryPort {
  return {
    catalog: vi.fn().mockResolvedValue(FONT_CATALOG),
    installed: vi.fn().mockResolvedValue(FONT_CATALOG),
    install: vi.fn(async (font: FontDefinition) => font),
    importFile: vi.fn().mockRejectedValue(new Error("Invalid font")),
    resolve: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    discoverLocal: vi.fn().mockResolvedValue([]),
    supportsLocalFonts: false,
    subscribe: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
    ...overrides,
  };
}

test("filters full virtual catalogs by category and installed state without loading every row", async () => {
  const remote: FontDefinition[] = Array.from({ length: 2000 }, (_, index) => ({
      id: `remote-${index}`,
      family: `Remote ${index}`,
      source: "google",
      category: index % 2 ? "serif" : "sans",
    })),
    library = platform({ catalog: vi.fn().mockResolvedValue([...FONT_CATALOG, ...remote]) });
  const data = mount(false, library);
  open();
  await screen.findByText("2020");
  expect(screen.getAllByRole("option")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Serif" }));
  expect(
    screen.getAllByRole("option").every((option) => option.getAttribute("aria-setsize") === "1004"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Installées" }));
  search("Remote");
  expect(screen.getByText("Aucune police trouvée")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Toutes" }));
  search("Remote 1999");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Rechercher une police" }), {
    key: "Enter",
  });
  await waitFor(() =>
    expect(library.install).toHaveBeenCalledWith(remote[1999], data.text.fontWeight),
  );
});

test("starts system discovery in the opening gesture and commits its canonical installed identity", async () => {
  let gesture = false;
  const local: FontDefinition = {
      id: "local-font",
      family: "local:Desktop-Regular",
      label: "Desktop Family",
      category: "sans",
      source: "local",
    },
    installed: FontDefinition = {
      ...local,
      id: "font-sha",
      family: "custom:font-sha",
      source: "user",
    },
    library = platform({
      supportsLocalFonts: true,
      discoverLocal: vi.fn(() => {
        expect(gesture).toBe(true);
        return Promise.resolve([local]);
      }),
      install: vi.fn().mockResolvedValue(installed),
    }),
    data = mount(false, library);
  gesture = true;
  open();
  gesture = false;
  expect(library.discoverLocal).toHaveBeenCalledOnce();
  search("Desktop Family");
  const option = await screen.findByRole("option", { name: "Desktop Family" });
  fireEvent.pointerOver(option);
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: local.family } });
  fireEvent.click(option);
  await waitFor(() => expect(data.layer().fontFamily).toBe(installed.family));
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent("Desktop Family");
  expect(data.changed).toHaveBeenCalledOnce();
});

test("does not repeat a denied system prompt across subsequent opens", async () => {
  const library = platform({
    supportsLocalFonts: true,
    discoverLocal: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
  });
  mount(false, library);
  open();
  await screen.findByText(/Les polices système sont indisponibles/);
  fireEvent.keyDown(document, { key: "Escape" });
  open();
  expect(library.discoverLocal).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: /système/ })).toBeNull();
});

test("imports supported files through the platform, reports real failures and preserves the document on error", async () => {
  const custom: FontDefinition = {
      id: "my-font",
      family: "custom:my-font",
      label: "My Font",
      category: "sans",
      source: "user",
    },
    library = platform(),
    data = mount(false, library);
  open();
  const input = screen.getByLabelText("Importer une police", { selector: "input" });
  const pickFile = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "Importer une police" }));
  expect(pickFile).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { files: [] } });
  fireEvent.change(input, { target: { files: [new File(["invalid"], "font.woff")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("TTF ou OTF");
  const huge = new File([], "huge.ttf");
  Object.defineProperty(huge, "size", { value: MAX_FONT_FILE_BYTES + 1 });
  fireEvent.change(input, { target: { files: [huge] } });
  expect(screen.getByRole("alert")).toHaveTextContent("32 Mo");
  expect(library.importFile).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [new File(["broken"], "broken.ttf")] } });
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.getByRole("alert")).toHaveTextContent("Impossible d’importer");
  expect(data.layer().fontFamily).toBe("Inter");
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  vi.mocked(library.importFile).mockResolvedValueOnce(custom);
  fireEvent.change(input, { target: { files: [new File(["source bytes"], "custom.otf")] } });
  await waitFor(() => expect(data.layer().fontFamily).toBe(custom.family));
  expect(data.changed).toHaveBeenCalledOnce();
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent("My Font");
});

test("rejects late install results after dismissal, reports installation failures and cleans subscriptions", async () => {
  let resolve!: (font: FontDefinition) => void;
  const unsubscribe = vi.fn(),
    library = platform({
      install: vi.fn(
        () =>
          new Promise<FontDefinition>((done) => {
            resolve = done;
          }),
      ),
      subscribe: vi.fn(() => unsubscribe),
    }),
    data = mount(false, library);
  open();
  fireEvent.click(screen.getByRole("option", { name: "Arimo" }));
  await waitFor(() => expect(library.install).toHaveBeenCalledOnce());
  fireEvent.keyDown(document, { key: "Escape" });
  await act(async () => {
    resolve(FONT_CATALOG[2]!);
  });
  expect(data.layer().fontFamily).toBe("Inter");
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  open();
  vi.mocked(library.install).mockRejectedValueOnce(new Error("Quota"));
  fireEvent.click(screen.getByRole("option", { name: "Arimo" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Impossible d’ajouter");
  data.view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(vi.mocked(library.subscribe).mock.calls.length);
  expect(library.dispose).not.toHaveBeenCalled();
});

test("previews filtered keyboard choices, wraps across virtual rows and commits Enter", () => {
  const data = mount();
  open();
  const field = screen.getByRole("combobox", { name: "Rechercher une police" });
  fireEvent.keyDown(field, { key: "ArrowUp" });
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: "Pacifico" } });
  expect(screen.getByRole("option", { name: "Pacifico" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("option", { name: "Inter" })).toBeNull();
  fireEvent.keyDown(field, { key: "ArrowDown" });
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: "Inter" } });
  search("playfair");
  expect(data.store.get(previewAtom)).toBeNull();
  fireEvent.keyDown(field, { key: "ArrowDown" });
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: "Playfair Display" } });
  expect(data.changed).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: "Enter" });
  expect(data.layer().fontFamily).toBe("Playfair Display");
  expect(data.changed).toHaveBeenCalledOnce();
});

test("Escape and outside dismissal restore the original font without recording a choice", async () => {
  const data = mount();
  open();
  const option = screen.getByRole("option", { name: "Arimo" });
  fireEvent.focus(option);
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fontFamily: "Arimo" } });
  fireEvent.keyDown(option, { key: "ArrowDown" });
  expect(screen.getByRole("combobox", { name: "Rechercher une police" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(data.store.get(previewAtom)).toBeNull();
  expect(data.layer().fontFamily).toBe("Inter");
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  open();
  fireEvent.pointerOver(screen.getByRole("option", { name: "Arimo" }));
  await userEvent.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(data.store.get(previewAtom)).toBeNull();
  expect(localStorage.getItem("musart.fonts.recent")).toBeNull();
});

test("filters localized categories, handles empty search and cancels an unmounted preview", () => {
  const data = mount();
  open();
  search("chasse fixe");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: "Roboto Mono" })).toBeVisible();
  search("no font matches this text");
  const field = screen.getByRole("combobox", { name: "Rechercher une police" });
  fireEvent.keyDown(field, { key: "ArrowDown" });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(screen.getByText("Aucune police trouvée")).toBeVisible();
  expect(data.changed).not.toHaveBeenCalled();
  search("lora");
  fireEvent.pointerOver(screen.getByRole("option", { name: "Lora" }));
  expect(data.store.get(previewAtom)).not.toBeNull();
  data.view.unmount();
  expect(data.store.get(previewAtom)).toBeNull();
});

test("scrolls the window without mounting the whole library and reuses explicit recent choices", async () => {
  const data = mount();
  open();
  fireEvent.scroll(screen.getByRole("listbox"), { target: { scrollTop: 616 } });
  expect(screen.queryByRole("option", { name: "Inter" })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: "Pacifico" }));
  open();
  const recent = screen.getByRole("group", { name: "Récentes" });
  fireEvent.pointerOver(within(recent).getByRole("button", { name: "Pacifico" }));
  fireEvent.focus(within(recent).getByRole("button", { name: "Pacifico" }));
  expect(data.layer().fontFamily).toBe("Pacifico");
  const revision = data.engine.getSnapshot().revision;
  fireEvent.click(within(recent).getByRole("button", { name: "Pacifico" }));
  expect(data.engine.getSnapshot().revision).toBe(revision);
  expect(data.store.get(previewAtom)).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("prevents opening or editing a locked text layer", () => {
  mount(true);
  expect(screen.getByRole("combobox", { name: "Police" })).toBeDisabled();
  open();
  expect(screen.queryByRole("listbox")).toBeNull();
});

test("shows the persisted user-font label while closed and never substitutes a fake Inter label", async () => {
  let resolve!: (fonts: readonly FontDefinition[]) => void;
  const custom: FontDefinition = {
      id: "saved-font",
      family: "custom:saved-font",
      label: "Saved Typeface",
      category: "sans",
      source: "user",
    },
    library = platform({
      installed: vi.fn(
        () =>
          new Promise<readonly FontDefinition[]>((done) => {
            resolve = done;
          }),
      ),
    }),
    data = mount(false, library);
  act(() =>
    data.engine.execute({
      type: "updateLayers",
      ids: [data.text.id],
      patch: { fontFamily: custom.family },
    }),
  );
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent(
    "Chargement des polices",
  );
  await act(async () => {
    resolve([custom]);
  });
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent("Saved Typeface");
  act(() =>
    data.engine.execute({
      type: "updateLayers",
      ids: [data.text.id],
      patch: { fontFamily: "Requested Named Typeface" },
    }),
  );
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent(
    "Requested Named Typeface",
  );
});

test("closed named-font triggers avoid platform metadata and full-catalog work until opened", () => {
  const library = platform(),
    data = mount(false, library);
  expect(library.installed).not.toHaveBeenCalled();
  expect(library.catalog).not.toHaveBeenCalled();
  act(() =>
    data.engine.execute({
      type: "updateLayers",
      ids: [data.text.id],
      patch: { fontFamily: "Tinos" },
    }),
  );
  expect(screen.getByRole("combobox", { name: "Police" })).toHaveTextContent("Tinos");
  expect(library.installed).not.toHaveBeenCalled();
  open();
  expect(library.installed).toHaveBeenCalledOnce();
  expect(library.catalog).toHaveBeenCalledOnce();
});
