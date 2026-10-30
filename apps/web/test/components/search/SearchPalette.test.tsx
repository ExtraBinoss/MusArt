import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createLayer } from "@musart/core";
import { createRef, Profiler } from "react";
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
function fixture(onCommit?: () => void) {
  const d = setup(),
    catalog = new SearchCatalog(),
    onChoose = vi.fn(),
    onClose = vi.fn();
  d.engine.select([d.rectangle.id]);
  const read = vi.spyOn(catalog, "read");
  const view = d.mount(
    <Profiler id="query-priority" onRender={() => onCommit?.()}>
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
      </SearchDialog>
    </Profiler>,
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

test("query followed immediately by Enter dispatches the new enabled match without a timer or animation wait", () => {
  const d = fixture();
  fireEvent.change(d.input, { target: { value: "baguette" } });
  expect(screen.getByRole("option", { name: /Baguette magique/ })).toHaveAttribute(
    "data-selected",
    "true",
  );
  fireEvent.change(d.input, { target: { value: "flou" } });
  fireEvent.keyDown(d.input, { key: "Enter" });
  expect(d.onChoose).toHaveBeenCalledOnce();
  expect(d.onChoose.mock.lastCall![0].target).toMatchObject({ kind: "effect" });
  expect(d.onChoose.mock.lastCall![0].label).toMatch(/Flou/);
});

test("urgent input commits retain inert old results before fresh criteria converge, without row or catalog work", () => {
  const samples: {
    echo: string;
    shown: string | undefined;
    pending: string | undefined;
    inert: boolean;
    row: Element | null;
    icons: number;
  }[] = [];
  let record = false;
  const d = fixture(() => {
    const list = document.querySelector<HTMLElement>("[cmdk-list]");
    if (!record || list?.dataset.searchPending !== "true") return;
    samples.push({
      echo: (document.querySelector("[role=combobox]") as HTMLInputElement).value,
      shown: list.dataset.searchQuery,
      pending: list.dataset.searchPending,
      inert: list.hasAttribute("inert"),
      row: list.querySelector("[role=option]"),
      icons: vi.mocked(getSearchIcon).mock.calls.length,
    });
  });
  fireEvent.change(d.input, { target: { value: "flou" } });
  const row = screen.getAllByRole("option")[0]!,
    reads = d.read.mock.calls.length,
    icons = vi.mocked(getSearchIcon).mock.calls.length;
  record = true;
  fireEvent.change(d.input, { target: { value: "flou " } });
  expect(samples).toContainEqual({
    echo: "flou ",
    shown: "flou",
    pending: "true",
    inert: true,
    row,
    icons,
  });
  const list = screen.getByRole("listbox");
  expect(list).toHaveAttribute("data-search-query", "flou ");
  expect(list).toHaveAttribute("data-search-pending", "false");
  expect(list).toHaveAttribute("aria-busy", "false");
  expect(list).not.toHaveAttribute("inert");
  expect(screen.getAllByRole("option")[0]).toBe(row);
  expect(getSearchIcon).toHaveBeenCalledTimes(icons);
  expect(d.read).toHaveBeenCalledTimes(reads);
});
test("queued row clicks and arrow navigation cannot use stale results while criteria are pending", () => {
  let intercept = false,
    guarded = false,
    retired: HTMLElement;
  const d = fixture(() => {
    if (
      !intercept ||
      guarded ||
      document.querySelector<HTMLElement>("[cmdk-list]")?.dataset.searchPending !== "true"
    )
      return;
    guarded = true;
    fireEvent.click(retired);
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    document.querySelector("[role=combobox]")!.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true);
  });
  fireEvent.change(d.input, { target: { value: "baguette" } });
  retired = screen.getByRole("option", { name: /Baguette magique/ });
  intercept = true;
  fireEvent.change(d.input, { target: { value: "flou" } });
  expect(guarded).toBe(true);
  expect(d.onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("option")[0]!);
  expect(d.onChoose).toHaveBeenCalledOnce();
  expect(d.onChoose.mock.lastCall![0].target.kind).toBe("effect");
});
test("Enter during the urgent commit synchronously ranks the latest query and chooses its enabled result", () => {
  let intercept = false,
    entered = false;
  const d = fixture(() => {
    if (
      !intercept ||
      entered ||
      document.querySelector<HTMLElement>("[cmdk-list]")?.dataset.searchPending !== "true"
    )
      return;
    entered = true;
    fireEvent.keyDown(document.querySelector("[role=combobox]")!, { key: "Enter" });
  });
  fireEvent.change(d.input, { target: { value: "baguette" } });
  intercept = true;
  fireEvent.change(d.input, { target: { value: "flou" } });
  expect(entered).toBe(true);
  expect(d.onChoose).toHaveBeenCalledOnce();
  expect(d.onChoose.mock.lastCall![0]).toMatchObject({
    label: expect.stringMatching(/Flou/),
    target: { kind: "effect" },
  });
});
test("deferred category and empty results report only displayed criteria while the selected tab stays urgent", () => {
  const pending: {
    category: string | undefined;
    query: string | undefined;
    selected: string | null;
    count: number;
  }[] = [];
  const d = fixture(() => {
    const list = document.querySelector<HTMLElement>("[cmdk-list]");
    if (list?.dataset.searchPending !== "true") return;
    pending.push({
      category: list.dataset.searchCategory,
      query: list.dataset.searchQuery,
      selected:
        document.querySelector('.magic-search-categories button[aria-pressed="true"]')
          ?.textContent ?? null,
      count: list.querySelectorAll("[role=option]").length,
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Calques" }));
  expect(pending).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: "all", query: "", selected: "Calques" }),
    ]),
  );
  expect(screen.getByRole("listbox")).toHaveAttribute("data-search-category", "layers");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  fireEvent.change(d.input, { target: { value: "zzzzz-none" } });
  expect(pending).toContainEqual({ category: "layers", query: "", selected: "Calques", count: 3 });
  expect(screen.getByRole("listbox")).toHaveAttribute("data-search-query", "zzzzz-none");
  expect(screen.getByRole("listbox")).toHaveAttribute("data-search-pending", "false");
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(
    screen.getByText("Aucun résultat. Essayez un autre mot ou une autre catégorie."),
  ).toBeVisible();
});
test("pending IME Enter keeps composition ownership and unmount retires deferred work and row callbacks", async () => {
  let intercept = false,
    composed = false;
  const d = fixture(() => {
    if (
      !intercept ||
      composed ||
      document.querySelector<HTMLElement>("[cmdk-list]")?.dataset.searchPending !== "true"
    )
      return;
    composed = true;
    for (const options of [{ isComposing: true }, { keyCode: 229 }]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...options,
      });
      document.querySelector("[role=combobox]")!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });
  intercept = true;
  fireEvent.change(d.input, { target: { value: "flou" } });
  expect(composed).toBe(true);
  expect(d.onChoose).not.toHaveBeenCalled();
  const retired = screen.getAllByRole("option")[0]!;
  act(() => {
    fireEvent.change(d.input, { target: { value: "other pending query" } });
    d.unmount();
  });
  const icons = vi.mocked(getSearchIcon).mock.calls.length;
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(retired);
  expect(document.querySelector("[cmdk-list]")).toBeNull();
  expect(getSearchIcon).toHaveBeenCalledTimes(icons);
  expect(d.onChoose).not.toHaveBeenCalled();
});

test("pending Enter cannot fall back to an old command when the latest query has no enabled match", () => {
  let intercept = false,
    entered = false;
  const d = fixture(() => {
    if (
      !intercept ||
      entered ||
      document.querySelector<HTMLElement>("[cmdk-list]")?.dataset.searchPending !== "true"
    )
      return;
    entered = true;
    fireEvent.keyDown(document.querySelector("[role=combobox]")!, { key: "Enter" });
  });
  fireEvent.change(d.input, { target: { value: "baguette" } });
  intercept = true;
  fireEvent.change(d.input, { target: { value: "zzzzz-none" } });
  expect(entered).toBe(true);
  expect(d.onChoose).not.toHaveBeenCalled();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});
