import { canvasContext } from "./components/motion/canvas/support";
import { beforeEach, expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { App } from "../src/App";
import { setup } from "./support/ui";
import { projectSummary } from "./support/projects";
import { toolAtom } from "../src/state/session/editor";
import { createEffect, createProject } from "@musart/core";
import { createMotionTransport } from "../src/services/motion/transport";
import { requestLayerTransition } from "../src/components/motion/transitions/requests";
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
});
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
test("the app owns one persistent transition editor for requests originating outside Layers", async () => {
  const d = setup();
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  await act(async () => {
    await requestLayerTransition(d.engine, d.page.id, d.rectangle.id, { x: 100, y: 120 });
  });
  expect(await screen.findByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
});
test("opening an effect on an unselected layer leaves the app shell untouched", async () => {
  const d = setup();
  const locationBefore = location.href;
  history.replaceState(null, "", "?automation=1");
  try {
    d.engine.execute({
      type: "updateLayers",
      ids: [d.rectangle.id],
      patch: { effects: [createEffect("receipt")] },
    });
    d.engine.select([]);
    d.mount(<App engine={d.engine} services={d.services} />);
    await screen.findByTestId("canvas");
    const root = document.querySelector(".musart-app")!;
    const before = root.getAttribute("data-react-renders");
    fireEvent.click(screen.getByRole("button", { name: "Ticket de caisse · Rectangle bleu" }));
    expect(screen.getByRole("dialog", { name: "Effets · Rectangle bleu" })).toBeVisible();
    expect(root).toHaveAttribute("data-react-renders", before);
    expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
    // Main retains secondary Inspector presentation while the attachment owns editing.
    expect(document.querySelector(".inspector-selection-boundary")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Effets · Rectangle bleu" }), {
      key: "Escape",
    });
    expect(screen.getByRole("region", { name: "Propriétés" })).toHaveAttribute(
      "data-selected-layer-id",
      d.rectangle.id,
    );
  } finally {
    history.replaceState(null, "", locationBefore);
  }
});
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
  await screen.findByRole("dialog", { name: "Tableau de bord Melt" });
  expect(screen.queryByRole("dialog", { name: "Un nouvel espace pour vos idées." })).toBeNull();
  expect(d.services.createProject).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fermer" }));
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  fireEvent.click(screen.getByRole("button", { name: "Projets" }));
  await screen.findByText("Aucun projet enregistré.");
  expect(screen.queryByRole("dialog", { name: "Un nouvel espace pour vos idées." })).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fermer" }));
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  fireEvent.click(screen.getByRole("button", { name: /^Enregistrer/ }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Projet enregistré"));
  fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
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
  fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
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
  const notice = screen.getByRole("alert");
  expect(notice.querySelector(".notice-content > p")).not.toHaveTextContent(
    "raw storage diagnostic",
  );
  expect(notice.querySelector("details")).not.toHaveAttribute("open");
  expect(notice.querySelector("pre")).toHaveTextContent(
    "Error [STALE_PROJECT_WRITE]: raw storage diagnostic",
  );
});
test("pauses failed Motion playback without changing the document or preventing a retry", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  const transport = createMotionTransport(d.engine),
    before = d.engine.getSnapshot();
  act(() => {
    transport.seek({ value: 1, rate: 2 });
    transport.play();
  });
  expect(transport.read().playing).toBe(true);
  fireEvent.click(screen.getByText("Canvas error"));
  expect(transport.read()).toMatchObject({ playing: false, time: { value: 1, rate: 2 } });
  expect(screen.getByRole("alert")).toHaveTextContent("Renderer unavailable");
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Canvas error"));
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(d.engine.getSnapshot()).toBe(before);
  act(() => transport.play());
  expect(transport.read().playing).toBe(true);
  act(() => transport.pause());
});
test("undoes and redoes Motion keys from timeline focus while keeping native field undo and save", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const before = d.engine.getSnapshot().project;
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 0, rate: 1 },
    value: 99,
  });
  const authored = d.engine.getSnapshot().project;
  d.mount(<App engine={d.engine} services={d.services} />);
  const ruler = await screen.findByRole("slider", { name: "Se déplacer dans la timeline" });
  await act(() => fireEvent.keyDown(ruler, { key: "z", ctrlKey: true }));
  expect(d.engine.getSnapshot().project).toBe(before);
  await act(() => fireEvent.keyDown(ruler, { key: "z", metaKey: true, shiftKey: true }));
  expect(d.engine.getSnapshot().project).toBe(authored);
  const field = screen.getByRole("spinbutton", { name: "Temps actuel" });
  const nativeUndo = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(field, nativeUndo);
  expect(nativeUndo.defaultPrevented).toBe(false);
  expect(d.engine.getSnapshot().project).toBe(authored);
  await act(() => fireEvent.keyDown(field, { key: "s", ctrlKey: true }));
  expect(d.services.saveProject).toHaveBeenCalledOnce();
});
test("opens the real project/export dialogs and switches panel modes through command search", async () => {
  const d = setup();
  d.mount(<App engine={d.engine} services={d.services} />);
  await screen.findByTestId("canvas");
  async function search(query: string, label: RegExp) {
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox", { name: "Rechercher dans Melt" }), {
      target: { value: query },
    });
    fireEvent.click(await screen.findByRole("option", { name: label }));
  }
  await search("new project", /Nouveau projet/);
  const creation = await screen.findByRole("dialog", { name: "Un nouvel espace pour vos idées." });
  expect(creation).toBeVisible();
  fireEvent.click(within(creation).getByRole("button", { name: "Fermer" }));
  expect(screen.queryByRole("dialog", { name: "Tableau de bord Melt" })).toBeNull();
  await search("animate", /Exporter un timelapse/);
  expect(await screen.findByRole("dialog", { name: "Timelapse" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Animation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
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
  expect(screen.getByRole("heading", { name: "Créez. Animez." })).toBeVisible();
  fireEvent.click(screen.getAllByRole("button", { name: "Commencer à créer" })[0]!);
  expect(
    await screen.findByRole("heading", { name: "Quel projet voulez-vous créer ?" }),
  ).toBeVisible();
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  expect(d.services.saveProject).not.toHaveBeenCalled();
  expect(screen.queryByRole("combobox", { name: "Rechercher dans Melt" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeVisible();
  const templates = screen.getByRole("button", { name: "Templates" });
  fireEvent.click(templates);
  expect(templates).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis Vidéo TikTok" }));
  await screen.findByTestId("canvas");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(d.services.createProject).toHaveBeenCalledWith(
    expect.objectContaining({ presetId: "tiktok-video" }),
  );
});

test("welcome preview can reopen the already restored project without replacing its identity", async () => {
  const previous = location.href;
  history.replaceState(null, "", "?welcome=1");
  try {
    const d = setup();
    vi.mocked(d.services.listProjectPage).mockResolvedValue({
      projects: [projectSummary(d.project.id, d.project.name)],
      before: null,
    });
    d.mount(<App engine={d.engine} services={d.services} />);
    expect(screen.queryByTestId("canvas")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Commencer à créer" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Atelier" }));
    const preview = await screen.findByRole("dialog", { name: "Ouvrir dans Melt" });
    fireEvent.click(within(preview).getByRole("button", { name: "Ouvrir dans Melt" }));
    await screen.findByTestId("canvas");
    expect(d.services.openProject).toHaveBeenCalledExactlyOnceWith(d.project.id);
    expect(d.engine.getSnapshot().project.id).toBe(d.project.id);
  } finally {
    history.replaceState(null, "", previous);
  }
});

test("routed library navigation retains the mounted editor and browser Back hides library state", async () => {
  const d = setup(),
    navigate = vi.fn();
  const routing = { view: "editor" as const, navigate };
  const view = d.mount(<App engine={d.engine} services={d.services} routing={routing} />);
  const canvas = await screen.findByTestId("canvas");
  fireEvent.click(screen.getByRole("button", { name: "Menu du projet" }));
  expect(navigate).toHaveBeenLastCalledWith("dashboard");
  view.rerender(
    <App engine={d.engine} services={d.services} routing={{ ...routing, view: "dashboard" }} />,
  );
  await screen.findByRole("dialog");
  expect(screen.getByTestId("canvas")).toBe(canvas);
  view.rerender(<App engine={d.engine} services={d.services} routing={routing} />);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByTestId("canvas")).toBe(canvas);
});
