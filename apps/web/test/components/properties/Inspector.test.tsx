import { expect, test, vi } from "vitest";
import { StrictMode } from "react";
import { act, screen, fireEvent } from "@testing-library/react";
import { choose } from "../../support/select";
import { createLayer, createPage, createProject } from "@musart/core";
import { Inspector } from "../../../src/components/properties/Inspector";
import { previewAtom, useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
async function chooseFont(font: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Police" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rechercher une police" }), {
    target: { value: font },
  });
  fireEvent.click(await screen.findByRole("option", { name: font }));
}
function renderInspector(selection: "shape" | "text" | "image" | "multiple" | "none" = "shape") {
  const data = setup();
  data.engine.select(
    selection === "none"
      ? []
      : selection === "multiple"
        ? [data.rectangle.id, data.text.id]
        : [
            selection === "text"
              ? data.text.id
              : selection === "image"
                ? data.image.id
                : data.rectangle.id,
          ],
  );
  function Live() {
    const s = useEngine(data.engine);
    const page = s.project.pages[0]!;
    return (
      <Inspector
        engine={data.engine}
        page={page}
        selected={page.layers.filter((layer) => s.selection.includes(layer.id))}
        run={data.run}
      />
    );
  }
  data.mount(<Live />);
  return data;
}
test("inherited locks explain the parent and disable layer properties until one undoable unlock", () => {
  const d = setup();
  d.engine.load(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "parent", name: "Protected parent", locked: true }),
            createLayer("rectangle", { id: "child", parentId: "parent" }),
          ],
        }),
      ],
    }),
  );
  d.engine.select(["child"]);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        selected={page.layers.filter((layer) => s.selection.includes(layer.id))}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  expect(screen.getByRole("status")).toHaveTextContent("Protected parent");
  for (const label of ["X", "Couleur hexadécimale", "Contour HEX"])
    expect(screen.getByRole("textbox", { name: label })).toBeDisabled();
  const before = d.engine.getSnapshot();
  fireEvent.blur(screen.getByRole("textbox", { name: "X" }), { target: { value: "99" } });
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "X" })).not.toBeDisabled();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]!.locked).toBe(false);
  act(() => d.engine.undo());
  expect(screen.getByRole("status")).toBeVisible();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("label resets use geometry defaults, keep numeric DOM stable and create one undo entry", () => {
  const data = renderInspector(),
    input = screen.getByLabelText("X");
  const before = data.engine.getSnapshot();
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster X" }));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(0);
  expect(screen.getByLabelText("X")).toBe(input);
  const reset = data.engine.getSnapshot();
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster X" }));
  expect(data.engine.getSnapshot()).toBe(reset);
  act(() => data.engine.undo());
  expect(data.engine.getSnapshot().project).toEqual(before.project);
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster Largeur" }));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.width).toBe(280);
});
test("StrictMode color rebinding remains bounded across hexadecimal, hue, alpha and saturation commits", () => {
  const data = setup(),
    errors = vi.spyOn(console, "error");
  data.engine.select([data.rectangle.id]);
  function Live() {
    const snapshot = useEngine(data.engine),
      page = snapshot.project.pages[0]!;
    return (
      <Inspector
        engine={data.engine}
        page={page}
        selected={page.layers.filter((layer) => snapshot.selection.includes(layer.id))}
        run={data.run}
      />
    );
  }
  data.mount(
    <StrictMode>
      <Live />
    </StrictMode>,
  );
  for (const color of ["#ff0080", "#20406080", "#000000", "#ffffff", "#55667780"]) {
    const input = screen.getByLabelText("Couleur hexadécimale");
    fireEvent.change(input, { target: { value: color } });
    fireEvent.keyUp(input, { key: "Enter" });
    expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe(color);
    expect(data.store.get(previewAtom)).toBeNull();
  }
  for (const selector of [".color-hue", ".color-alpha", ".react-colorful__saturation"]) {
    const slider = document.querySelector(`${selector} [role=slider]`)!;
    fireEvent.keyDown(slider, { key: "ArrowRight", keyCode: 39, which: 39 });
    fireEvent.keyUp(slider, { key: "ArrowRight", keyCode: 39, which: 39 });
    expect(data.store.get(previewAtom)).toBeNull();
  }
  act(() => data.engine.select([data.text.id]));
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue(data.text.fill.toUpperCase());
  expect(errors).not.toHaveBeenCalled();
});
test("previews fill without mutating document then commits shape properties", () => {
  const data = renderInspector();
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#ff8844" } });
  expect(data.store.get(previewAtom)).toMatchObject({
    target: "layer",
    patch: { fill: "#ff8844" },
  });
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#3366ff");
  fireEvent.pointerUp(color);
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#ff8844");
  for (const [label, value] of [
    ["X", "50"],
    ["Y", "60"],
    ["Largeur", "250"],
    ["Hauteur", "150"],
    ["Rotation", "15"],
    ["Arrondi", "20"],
    ["Contour", "2"],
  ] as const) {
    const input = screen.getByRole("textbox", { name: label });
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  fireEvent.change(screen.getByLabelText("Contour HEX"), { target: { value: "#222222" } });
  fireEvent.blur(screen.getByLabelText("Contour HEX"));
  fireEvent.blur(screen.getByLabelText("Contour HEX"), { target: { value: "bad" } });
  expect(screen.queryByRole("textbox", { name: "Opacité" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Fusion" })).not.toBeInTheDocument();
  const layer = data.engine.getSnapshot().project.pages[0]!.layers[0]!;
  expect(layer).toMatchObject({
    x: 50,
    y: 60,
    width: 250,
    height: 150,
    rotation: 15,
    radius: 20,
    strokeWidth: 2,
    stroke: "#222222",
    blendMode: "normal",
    opacity: 1,
  });
  fireEvent.keyDown(screen.getByLabelText("Couleur hexadécimale"), { key: "Escape" });
  expect(data.store.get(previewAtom)).toBeNull();
});
test("edits document dimensions, background and guides without selecting a layer", () => {
  const data = renderInspector("none");
  const rename = screen.getByLabelText("Nom de la composition");
  fireEvent.blur(rename, { target: { value: "" } });
  fireEvent.change(rename, { target: { value: "Nouvelle page" } });
  fireEvent.blur(rename);
  for (const [label, value] of [
    ["Largeur", "1920"],
    ["Hauteur", "1200"],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.blur(screen.getByLabelText(label));
  }
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#111111" } });
  expect(data.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { background: "#111111" },
  });
  fireEvent.pointerUp(color);
  expect(data.engine.getSnapshot().project.pages[0]!).toMatchObject({
    name: "Nouvelle page",
    width: 1920,
    height: 1200,
    background: "#111111",
  });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter vertical" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter horizontal" }));
  expect(data.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Effacer les repères" }));
  expect(data.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(0);
});
test("keeps text editable and edits typography and alignment", async () => {
  const data = renderInspector("text");
  fireEvent.change(screen.getByLabelText("Contenu du texte"), {
    target: { value: "MusArt Studio" },
  });
  fireEvent.blur(screen.getByLabelText("Contenu du texte"));
  await chooseFont("Tinos");
  for (const [label, value] of [
    ["Corps", "64"],
    ["Graisse", "700"],
    ["Interligne", "1.5"],
    ["Approche", "2"],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.blur(screen.getByLabelText(label));
  }
  fireEvent.click(screen.getByLabelText("Centrer le texte"));
  fireEvent.click(screen.getByLabelText("Aligner à droite"));
  fireEvent.click(screen.getByLabelText("Aligner à gauche"));
  expect(
    data.engine.getSnapshot().project.pages[0]!.layers.find((l) => l.id === data.text.id),
  ).toMatchObject({
    text: "MusArt Studio",
    fontFamily: "Tinos",
    fontSize: 64,
    fontWeight: 700,
    lineHeight: 1.5,
    letterSpacing: 2,
    textAlign: "left",
  });
});

test("routes text gradient colors through one preview and undoable commit while preserving solid fill", async () => {
  const data = renderInspector("text"),
    fill = data.text.fill;
  await choose("Type de remplissage", "Dégradé linéaire");
  const before = data.engine.getSnapshot();
  expect(before.project.pages[0]!.layers[1]!.fillGradient?.kind).toBe("linear");
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#ff004480" } });
  expect(data.engine.getSnapshot()).toBe(before);
  expect(data.store.get(previewAtom)).toMatchObject({
    target: "layer",
    layerId: data.text.id,
    patch: { fillGradient: { stops: [{ color: "#ff004480" }, { offset: 1 }] } },
  });
  fireEvent.pointerUp(color);
  expect(data.engine.getSnapshot().revision).toBe(before.revision + 1);
  expect(data.engine.getSnapshot().project.pages[0]!.layers[1]).toMatchObject({
    fill,
    fillGradient: { stops: [{ color: "#ff004480" }, { offset: 1 }] },
  });
  expect(data.store.get(previewAtom)).toBeNull();
  act(() => data.engine.undo());
  expect(data.engine.getSnapshot().project.pages[0]!.layers[1]!.fillGradient).toEqual(
    before.project.pages[0]!.layers[1]!.fillGradient,
  );
  await choose("Type de remplissage", "Uni");
  expect(data.engine.getSnapshot().project.pages[0]!.layers[1]!.fillGradient).toBeUndefined();
  expect(screen.getByLabelText("Couleur hexadécimale")).toHaveValue(fill.toUpperCase());
});
test("keeps compositing, effect and mask controls exclusively in the layer tree", () => {
  const data = renderInspector("multiple");
  expect(screen.queryByRole("textbox", { name: "Opacité" })).not.toBeInTheDocument();
  act(() => {
    data.engine.execute({
      type: "updateLayers",
      ids: [data.image.id],
      patch: { mask: { assetId: "asset1", enabled: true, inverted: false } },
    });
    data.engine.select([data.image.id]);
  });
  expect(screen.queryByLabelText("Inverser le masque")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Retirer le masque")).not.toBeInTheDocument();
});

test("previews image dimensions with aspect lock and exposes honest working-color options", async () => {
  const d = renderInspector("image");
  fireEvent.change(screen.getByLabelText("Largeur"), { target: { value: "400" } });
  expect(d.store.get(previewAtom)).toMatchObject({ target: "layer", patch: { width: 400 } });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.width).toBe(280);
  fireEvent.blur(screen.getByLabelText("Largeur"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.height).toBeCloseTo((400 * 220) / 280);
  fireEvent.change(screen.getByLabelText("Échelle de l’image"), { target: { value: "150" } });
  fireEvent.blur(screen.getByLabelText("Échelle de l’image"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.width).toBe(150);
  fireEvent.click(screen.getByLabelText("Conserver les proportions"));
  fireEvent.change(screen.getByLabelText("Hauteur"), { target: { value: "50" } });
  fireEvent.blur(screen.getByLabelText("Hauteur"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]).toMatchObject({
    width: 150,
    height: 50,
  });
  await choose("Mode colorimétrique", "Simulation CMJN (RGB)");
  expect(screen.getByText(/Sans profil ICC/)).toBeVisible();
  await choose("Mode colorimétrique", "Display P3");
  expect(screen.getByText(/exports sont convertis en sRGB/)).toBeVisible();
});

test("previews valid stroke colors, restores invalid drafts, and commits a completed color once", () => {
  const d = renderInspector();
  const field = screen.getByLabelText("Contour HEX");
  fireEvent.change(field, { target: { value: "#445566" } });
  expect(d.store.get(previewAtom)).toMatchObject({ target: "layer", patch: { stroke: "#445566" } });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.stroke).toBe("#ffffff");
  fireEvent.change(field, { target: { value: "invalid" } });
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.blur(field);
  expect(field).toHaveValue("#ffffff");
  fireEvent.change(field, { target: { value: "#aabbcc" } });
  fireEvent.keyDown(field, { key: "Escape" });
  expect(field).toHaveValue("#ffffff");
  expect(d.store.get(previewAtom)).toBeNull();
  field.focus();
  fireEvent.change(field, { target: { value: "#123456" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.stroke).toBe("#123456");
  expect(d.store.get(previewAtom)).toBeNull();
});

function vectorInspector() {
  const d = setup();
  const vector = createLayer("vector", {
    id: "brand-vector",
    vector: {
      viewBox: "0 0 10 10",
      preserveColors: true,
      parts: [
        { path: "M0 0H5V10H0Z", fill: "#ff0000" },
        { path: "M5 0H10V10H5Z", fill: "#00ff00" },
      ],
    },
  });
  d.engine.execute({ type: "addLayers", layers: [vector] });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([vector.id]);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        selected={page.layers.filter((layer) => s.selection.includes(layer.id))}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  return d;
}
test("previews a vector fill override and restores its original paints on cancel", () => {
  const d = vectorInspector();
  const field = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(field, { target: { value: "#1133ff" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layer",
    patch: { fill: "#1133ff", vector: { preserveColors: false } },
  });
  expect(d.engine.getSnapshot().project.pages[0]!.layers.at(-1)!.vector?.preserveColors).toBe(true);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.pointerCancel(field);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(screen.getByLabelText("Couleurs d’origine")).toBeChecked();
});
test("commits a vector fill and restores original brand paints with one undoable toggle", () => {
  const d = vectorInspector();
  fireEvent.change(screen.getByLabelText("Couleur hexadécimale"), { target: { value: "#1133ff" } });
  fireEvent.pointerUp(screen.getByLabelText("Couleur hexadécimale"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.at(-1)).toMatchObject({
    fill: "#1133ff",
    vector: { preserveColors: false },
  });
  fireEvent.click(screen.getByLabelText("Couleurs d’origine"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.at(-1)!.vector?.preserveColors).toBe(true);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers.at(-1)!.vector?.preserveColors).toBe(
    false,
  );
});

test("selecting a different layer reuses geometry and spacing input elements", () => {
  const d = renderInspector(),
    x = screen.getByLabelText("X"),
    width = screen.getByLabelText("Largeur"),
    top = screen.getAllByLabelText("Haut")[0];
  act(() => d.engine.select([d.image.id]));
  expect(screen.getByLabelText("X")).toBe(x);
  expect(screen.getByLabelText("Largeur")).toBe(width);
  expect(screen.getAllByLabelText("Haut")[0]).toBe(top);
  expect(x).toHaveValue(String(d.image.x));
});
