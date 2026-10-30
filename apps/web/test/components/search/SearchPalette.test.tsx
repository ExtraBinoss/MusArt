import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createLayer } from "@musart/core";
import { createRef } from "react";
import { setup } from "../../support/ui";
import { SearchPalette } from "../../../src/components/search/SearchPalette";
import { SearchCatalog } from "../../../src/components/search/catalog/cache";
import { SearchDialog } from "../../../src/components/search/SearchDialog";
import { bindingSnapshot } from "../../../src/state/keybindings/preferences";
import { i18n } from "../../../src/state/i18n";
import { getSearchIcon } from "../../../src/components/search/icons";
vi.mock("../../../src/components/search/icons", async (original) => ({
  ...(await original<typeof import("../../../src/components/search/icons")>()),
  getSearchIcon: vi.fn(
    (await original<typeof import("../../../src/components/search/icons")>()).getSearchIcon,
  ),
}));
function fixture() {
  const d = setup(),
    catalog = new SearchCatalog(),
    onChoose = vi.fn(),
    onClose = vi.fn();
  d.engine.select([d.rectangle.id]);
  const read = vi.spyOn(catalog, "read");
  const view = d.mount(
    <SearchDialog open reduced onOpenChange={vi.fn()}>
      <SearchPalette
        engine={d.engine}
        catalog={catalog}
        t={(key, values) => String(i18n.t(key, values))}
        bindings={bindingSnapshot()}
        locale="fr"
        inputRef={createRef<HTMLInputElement>()}
        reduced
        onChoose={onChoose}
        onClose={onClose}
      />
    </SearchDialog>,
  );
  return { ...d, ...view, catalog, read, onChoose, onClose, input: screen.getByRole("combobox") };
}
test("typing and native selection stay inside the palette without reading catalog or rebuilding retained rows", async () => {
  const d = fixture();
  fireEvent.change(d.input, { target: { value: "flou" } });
  const option = screen.getAllByRole("option")[0]!;
  const reads = d.read.mock.calls.length,
    icons = vi.mocked(getSearchIcon).mock.calls.length;
  fireEvent.change(d.input, { target: { value: "flou " } });
  expect(screen.getAllByRole("option")[0]).toBe(option);
  expect(d.read).toHaveBeenCalledTimes(reads);
  expect(getSearchIcon).toHaveBeenCalledTimes(icons);
  fireEvent.keyDown(d.input, { key: "ArrowDown" });
  fireEvent.keyDown(d.input, { key: "Enter" });
  expect(d.onChoose).toHaveBeenCalledOnce();
  expect(d.onChoose.mock.lastCall![0].target.kind).toBe("effect");
  expect(d.read).toHaveBeenCalledTimes(reads);
  expect(document.querySelector(".magic-search-footer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(d.onClose).toHaveBeenCalledOnce();
});
test("disabled results follow actual engine selection and never dispatch", async () => {
  const d = fixture();
  fireEvent.change(d.input, { target: { value: "duplicate" } });
  const enabled = screen.getByRole("option", { name: /Dupliquer/ });
  expect(enabled).toHaveAttribute("aria-disabled", "false");
  act(() => d.engine.select([]));
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /Dupliquer/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    ),
  );
  fireEvent.click(screen.getByRole("option", { name: /Dupliquer/ }));
  fireEvent.keyDown(d.input, { key: "Enter" });
  expect(d.onChoose).not.toHaveBeenCalled();
});
test("large result sets retain the 80-row bound, search accurately, and browse real localized categories", () => {
  const d = fixture();
  act(() =>
    d.engine.load({
      ...d.project,
      pages: [
        {
          ...d.page,
          layers: [
            ...d.page.layers,
            ...Array.from({ length: 90 }, (_, index) =>
              createLayer("rectangle", { name: `Findme ${index}` }),
            ),
          ],
        },
      ],
    }),
  );
  fireEvent.change(d.input, { target: { value: "findme" } });
  expect(screen.getAllByRole("option")).toHaveLength(80);
  expect(screen.getByRole("listbox")).toHaveAttribute("data-search-result-count", "90");
  expect(screen.getByRole("status")).toHaveTextContent("90 résultats");
  fireEvent.change(d.input, { target: { value: "findme 89" } });
  expect(screen.getByRole("option", { name: /Findme 89/ })).toBeVisible();
  fireEvent.change(d.input, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Calques" }));
  expect(screen.getAllByRole("option")).toHaveLength(80);
  expect(d.input).toHaveFocus();
  fireEvent.change(d.input, { target: { value: "nothing-to-find" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(
    screen.getByText("Aucun résultat. Essayez un autre mot ou une autre catégorie."),
  ).toBeVisible();
});
