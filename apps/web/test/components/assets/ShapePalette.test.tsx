import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createLayer } from "@musart/core";
import { loadAssets, type CatalogAsset } from "@musart/assets";
import { ShapePalette } from "../../../src/components/assets/ShapePalette";
import { setup } from "../../support/ui";
vi.mock("@musart/assets", async (original) => ({
  ...(await original<typeof import("@musart/assets")>()),
  loadAssets: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
const artworks = Array.from({ length: 120 }, (_, index): CatalogAsset => ({
  id: `art-${index}`,
  name: `Artwork ${index}`,
  viewBox: "0 0 10 10",
  path: "M0 0H10V10Z",
}));
function tab(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
function file(content: string, name = "custom.svg") {
  const value = new File([content], name, { type: "image/svg+xml" });
  Object.defineProperty(value, "text", { value: async () => content });
  return value;
}
test("virtualizes catalog rows, filters real search, chooses with Enter and keeps categories distinct", async () => {
  vi.mocked(loadAssets).mockResolvedValue(artworks);
  const d = setup(),
    choose = vi.fn();
  d.mount(<ShapePalette engine={d.engine} onChoose={choose} />);
  await screen.findByText("120 résultats");
  expect(screen.getByRole("group", { name: "Bibliothèque" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Formes" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("button", { name: /Utiliser Artwork/ }).length).toBeLessThanOrEqual(
    40,
  );
  const region = screen.getByRole("region", { name: "Formes" });
  fireEvent.scroll(region, { target: { scrollTop: 510 } });
  expect(screen.queryByRole("button", { name: "Utiliser Artwork 0" })).toBeNull();
  const input = screen.getByLabelText("Rechercher");
  fireEvent.change(input, { target: { value: "Artwork 119" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(choose).toHaveBeenLastCalledWith(expect.objectContaining({ id: "art-119" }));
  fireEvent.click(screen.getByRole("button", { name: "Utiliser Artwork 119" }));
  expect(choose).toHaveBeenCalledTimes(2);
  fireEvent.change(input, { target: { value: "nothing matches xyz" } });
  expect(screen.getByText("Aucun résultat")).toBeVisible();
  tab("Icônes");
  await waitFor(() => expect(loadAssets).toHaveBeenCalledWith("icons"));
  expect(screen.getByRole("button", { name: "Icônes" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Formes" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("Rechercher")).toHaveValue("");
});
test("imports local SVGs, restores document imports and reports invalid or oversized files", async () => {
  vi.mocked(loadAssets).mockResolvedValue([]);
  const d = setup(),
    choose = vi.fn();
  d.engine.execute({
    type: "addLayers",
    layers: [
      createLayer("vector", {
        name: "Existing SVG",
        vector: {
          viewBox: "0 0 10 10",
          path: "M0 0H10V10Z",
          attribution: "Imported SVG: existing.svg",
        },
      }),
    ],
  });
  d.mount(<ShapePalette engine={d.engine} onChoose={choose} />);
  await screen.findByText("Aucun résultat");
  tab("Importées");
  await screen.findByRole("button", { name: "Utiliser Existing SVG" });
  const input = screen.getByLabelText("Importer un SVG", { selector: "input" });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    fillStyle: "#000000",
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.stubGlobal("CSS", { supports: () => true });
  fireEvent.change(input, { target: { files: [] } });
  fireEvent.change(input, { target: { files: [file("x".repeat(256001))] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("moins de 256 Ko");
  fireEvent.change(input, { target: { files: [file("broken")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible d’importer");
  fireEvent.change(input, {
    target: {
      files: [
        file(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10Z" fill="#ff0000"/></svg>',
        ),
      ],
    },
  });
  await screen.findByRole("button", { name: "Utiliser custom" });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Utiliser custom" }));
  expect(choose).toHaveBeenCalledWith(
    expect.objectContaining({ name: "custom", parts: expect.any(Array) }),
  );
});
test("cancels stale category loads and exposes load errors without publishing stale items", async () => {
  let resolveIcons!: (value: readonly CatalogAsset[]) => void;
  vi.mocked(loadAssets).mockImplementation((kind) =>
    kind === "icons"
      ? new Promise((resolve) => {
          resolveIcons = resolve;
        })
      : kind === "brands"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve([artworks[0]!]),
  );
  const d = setup();
  const view = d.mount(<ShapePalette engine={d.engine} onChoose={vi.fn()} />);
  await screen.findByRole("button", { name: "Utiliser Artwork 0" });
  tab("Icônes");
  tab("Marques");
  expect(await screen.findByRole("alert")).toHaveTextContent("n’a pas pu être chargée");
  await act(async () => {
    resolveIcons([artworks[1]!]);
  });
  expect(screen.queryByRole("button", { name: "Utiliser Artwork 1" })).toBeNull();
  view.unmount();
});
