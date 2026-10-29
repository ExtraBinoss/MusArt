import { expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { App } from "../src/App";
import { setup } from "./support/ui";
import { toolAtom } from "../src/state/session/editor";
import { createProject } from "@musart/core";
vi.mock("../src/canvas/EditorCanvas", () => ({
  EditorCanvas: ({
    onError,
    onDropFiles,
    onImagePoint,
  }: {
    onError(this: void, message: string): void;
    onDropFiles(this: void, files: File[]): void;
    onImagePoint(this: void, id: string, x: number, y: number): void;
  }) => (
    <div data-testid="canvas">
      <button onClick={() => onError("Renderer unavailable")}>Canvas error</button>
      <button onClick={() => onDropFiles([new File(["x"], "sample.png", { type: "image/png" })])}>
        Drop image
      </button>
      <button onClick={() => onImagePoint("image", 12, 24)}>Image point</button>
    </div>
  ),
}));
test("assembles the pinned inspector, layers, project menu, export and import actions", async () => {
  const d = setup();
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  expect(screen.getByRole("region", { name: "Propriétés" })).toBeInTheDocument();
  expect(screen.getByRole("tree", { name: "Calques" })).toBeInTheDocument();
  expect(screen.getAllByRole("separator").length).toBeGreaterThanOrEqual(2);
  fireEvent.click(screen.getByText("Drop image"));
  await waitFor(() => expect(d.services.importFiles).toHaveBeenCalled());
  const file = new File(["image"], "picture.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Importer des images", { selector: "input" }), {
    target: { files: [file] },
  });
  fireEvent.change(screen.getByLabelText("Importer des images", { selector: "input" }), {
    target: { files: [] },
  });
  expect(d.services.importFiles).toHaveBeenCalledWith([file]);
  fireEvent.click(screen.getByRole("button", { name: "Importer des images" }));
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Exporter la composition");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }));
  fireEvent.click(screen.getByRole("button", { name: "Menu du projet" }));
  await screen.findByText("Aucun projet enregistré.");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fermer" }));
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  fireEvent.click(screen.getByRole("button", { name: /^Enregistrer/ }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Projet enregistré"));
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  const projectName = screen.getByLabelText("Nom du projet");
  fireEvent.change(projectName, { target: { value: "Collection" } });
  fireEvent.blur(projectName);
  expect(d.engine.getSnapshot().project.name).toBe("Collection");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByText("Rectangle bleu"));
  const input = screen.getByLabelText("X");
  fireEvent.change(input, { target: { value: "99" } });
  fireEvent.blur(input);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(99);
});
test("surfaces renderer and service errors and routes local image selection using the active tool", async () => {
  const d = setup();
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  fireEvent.click(screen.getByText("Canvas error"));
  expect(screen.getByRole("alert")).toHaveTextContent("Renderer unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  fireEvent.click(screen.getByText("Image point"));
  expect(d.services.selectImagePoint).not.toHaveBeenCalled();
  act(() => d.store.set(toolAtom, "wand"));
  fireEvent.click(screen.getByText("Image point"));
  await waitFor(() =>
    expect(d.services.selectImagePoint).toHaveBeenCalledWith("image", 12, 24, "wand", 32),
  );
  vi.mocked(d.services.importFiles).mockRejectedValueOnce("Import failed");
  fireEvent.click(screen.getByText("Drop image"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Import failed"));
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  vi.mocked(d.services.saveProject).mockRejectedValueOnce(new Error("Quota exceeded"));
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Quota exceeded"));
});
test("localizes stale project-write failures at the editor task boundary", async () => {
  const d = setup();
  vi.mocked(d.services.saveProject).mockRejectedValueOnce(
    Object.assign(new Error("raw storage diagnostic"), { code: "STALE_PROJECT_WRITE" }),
  );
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ce projet a changé"));
  expect(screen.getByRole("alert")).not.toHaveTextContent("raw storage diagnostic");
});
test("opens the real project/export dialogs and switches panel modes through command search", async () => {
  const d = setup();
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  async function search(query: string, label: RegExp) {
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox", { name: "Rechercher dans MusArt" }), {
      target: { value: query },
    });
    fireEvent.click(await screen.findByRole("option", { name: label }));
  }
  await search("new project", /Nouveau projet/);
  expect(
    await screen.findByRole("heading", { name: "Quel projet voulez-vous créer ?" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await search("animate", /Ouvrir Animate/);
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true"),
  );
  await search("png", /Exporter/);
  expect(await screen.findByRole("dialog", { name: "Exporter la composition" })).toBeVisible();
});
test("starts with the shared empty dashboard and mounts the editor only after choosing a real project", async () => {
  localStorage.removeItem("musart.onboarding.v1");
  const d = setup();
  vi.mocked(d.services.createProject).mockImplementation(async () => {
    d.engine.load(createProject({ id: "chosen-project", name: "TikTok video" }));
  });
  d.mount(<App engine={d.engine} services={d.services} welcome />);
  expect(screen.queryByTestId("canvas")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Bienvenue dans MusArt" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Faire un petit tour" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon atelier" }));
  expect(
    await screen.findByRole("heading", { name: "Quel projet voulez-vous créer ?" }),
  ).toBeVisible();
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  expect(d.services.saveProject).not.toHaveBeenCalled();
  expect(screen.queryByRole("combobox", { name: "Rechercher dans MusArt" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeVisible();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Templates" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis Vidéo TikTok" }));
  await screen.findByTestId("canvas");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(d.services.createProject).toHaveBeenCalledWith(
    expect.objectContaining({ presetId: "tiktok-video" }),
  );
});
