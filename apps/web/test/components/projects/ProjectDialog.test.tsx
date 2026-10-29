import { expect, test, vi } from "vitest";
import { act, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProjectDialog } from "../../../src/components/projects/ProjectDialog";
import { setup } from "../../support/ui";
import { projectSummary } from "../../support/projects";
import * as templates from "../../../src/services/projects/templates/catalog";
test("new-project Escape dismisses creation and returns to the library", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <ProjectDialog
      initialView="newProject"
      services={d.services}
      onClose={close}
      onTask={d.onTask}
    />,
  );
  const name = screen.getByLabelText("Nom");
  expect(name).toHaveFocus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.keyDown(name, { key: "Escape" });
  await waitFor(() => expect(screen.queryByLabelText("Nom")).toBeNull());
  expect(screen.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  expect(close).not.toHaveBeenCalled();
});
test("shares a clean two-tab dashboard between welcome and open-project states", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <ProjectDialog services={d.services} projectName="Atelier" onClose={close} onTask={d.onTask} />,
  );
  const dialog = screen.getByRole("dialog", { name: "Tableau de bord MusArt" });
  await screen.findByText("Aucun projet enregistré.");
  expect(
    within(dialog)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Projets", "Templates"]);
  expect(within(dialog).getByRole("heading", { name: "Vos projets" })).toBeVisible();
  for (const name of ["Enregistrer", "Télécharger le projet", "Importer des images"])
    expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Templates" }), { button: 0 });
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Quel projet voulez-vous créer ?" })).toBeVisible(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Canvas personnalisé" }));
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  await waitFor(() => expect(d.services.createProject).toHaveBeenCalledOnce());
  expect(close).toHaveBeenCalledOnce();
});
test("imports a real portable file once and closes only after successful completion", async () => {
  const d = setup(),
    close = vi.fn();
  let resolve!: () => void;
  vi.mocked(d.services.openPortable).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  d.mount(<ProjectDialog services={d.services} onClose={close} onTask={d.onTask} />);
  await screen.findByText("Aucun projet enregistré.");
  expect(screen.getByRole("heading", { name: "Quel projet voulez-vous créer ?" })).toBeVisible();
  const input = screen.getByLabelText("Importer .musart", { selector: "input" });
  const click = vi.spyOn(input as HTMLInputElement, "click");
  fireEvent.pointerDown(screen.getByRole("button", { name: "Options de création" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Importer .musart" }));
  expect(click).toHaveBeenCalledOnce();
  const file = new File(["{}"], "art.musart");
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.change(input, { target: { files: [file] } });
  expect(d.services.openPortable).toHaveBeenCalledExactlyOnceWith(file);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Options de création" })).toBeDisabled();
  await act(async () => resolve());
  expect(close).toHaveBeenCalledOnce();
});
test("template choices use the real creation API and preserve failure state", async () => {
  const d = setup(),
    close = vi.fn();
  vi.mocked(d.services.createProject).mockRejectedValueOnce(new Error("Quota exceeded"));
  d.mount(
    <ProjectDialog
      initialView="templates"
      services={d.services}
      onClose={close}
      onTask={d.onTask}
    />,
  );
  const preset = screen.getByRole("button", { name: /Publication Instagram/ });
  fireEvent.click(preset);
  await waitFor(() => expect(d.onTask).toHaveLastResolvedWith(false));
  expect(close).not.toHaveBeenCalled();
  expect(preset).not.toBeDisabled();
  fireEvent.click(preset);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(d.services.createProject).toHaveBeenLastCalledWith(
    expect.objectContaining({ presetId: "instagram-post", width: 1080, height: 1080 }),
  );
});
test("welcome cannot be dismissed and custom creation remains available without a saved project", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <ProjectDialog
      welcome
      initialView="newProject"
      services={d.services}
      onClose={close}
      onTask={d.onTask}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Un nouvel espace pour vos idées." });
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByLabelText("Nom")).toBeNull());
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
});
test("late work cannot dismiss a replacement dashboard after unmount", async () => {
  const d = setup(),
    close = vi.fn();
  let resolve!: () => void;
  vi.mocked(d.services.createProject).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const view = d.mount(
    <ProjectDialog
      initialView="newProject"
      services={d.services}
      onClose={close}
      onTask={d.onTask}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
  view.unmount();
  await act(async () => resolve());
  expect(close).not.toHaveBeenCalled();
});
test("captures template origin before download, prevents duplicate opening, and aborts on scope replacement or unmount", async () => {
  const d = setup(),
    close = vi.fn();
  let finish!: () => void;
  const create = vi
    .spyOn(templates, "createProjectFromTemplate")
    .mockImplementation(async (_services, _id, options) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      options?.signal?.throwIfAborted();
    });
  const first = { projectId: "origin", pageId: "page", revision: 3 };
  const props = {
    services: d.services,
    initialView: "templates" as const,
    onClose: close,
    onTask: d.onTask,
  };
  const view = d.mount(<ProjectDialog {...props} origin={first} />);
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  const card = screen.getByRole("button", { name: /In Bloom/ });
  fireEvent.click(card);
  fireEvent.click(card);
  expect(create).toHaveBeenCalledOnce();
  const options = create.mock.calls[0]![2]!;
  expect(options.expectedOrigin).toBe(first);
  expect(options.signal!.aborted).toBe(false);
  expect(
    within(screen.getByRole("tabpanel", { name: "Templates" }))
      .getByText("Préparation du modèle…")
      .closest('[role="status"]'),
  ).toHaveTextContent("Préparation du modèle");
  view.rerender(<ProjectDialog {...props} origin={{ ...first, revision: 4 }} />);
  expect(options.signal!.aborted).toBe(true);
  await act(async () => finish());
  expect(close).not.toHaveBeenCalled();
  expect(card).not.toBeDisabled();
  fireEvent.click(card);
  const second = create.mock.calls[1]![2]!.signal!;
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(second.aborted).toBe(true);
  view.unmount();
  expect(second.aborted).toBe(true);
  await act(async () => finish());
  expect(close).not.toHaveBeenCalled();
});
test("preferences requested by search open in a separate dialog rather than a dashboard tab", () => {
  const d = setup(),
    close = vi.fn();
  d.mount(
    <ProjectDialog
      initialView="settings"
      services={d.services}
      onClose={close}
      onTask={d.onTask}
    />,
  );
  expect(screen.getByRole("dialog", { name: "Préférences" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Général" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("tab", { name: "Projets" })).not.toBeInTheDocument();
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalled();
});
test("the search editor route opens snapping preferences directly without loading the project gallery", () => {
  const d = setup();
  d.mount(
    <ProjectDialog
      initialView="settingsEditor"
      services={d.services}
      onClose={vi.fn()}
      onTask={d.onTask}
    />,
  );
  expect(screen.getByRole("tab", { name: "Éditeur" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("switch", { name: "Accrocher aux éléments" })).toBeVisible();
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
});

test("one shared import/open gate disables tabs and card mutations until the real operation finishes", async () => {
  const d = setup(),
    close = vi.fn();
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [projectSummary(), projectSummary("b", "Second")],
    before: null,
  });
  let finish!: () => void;
  vi.mocked(d.services.openPortable).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  d.mount(<ProjectDialog services={d.services} onClose={close} onTask={d.onTask} />);
  await screen.findByRole("article", { name: "Study" });
  const file = new File(["{}"], "import.musart"),
    input = screen.getByLabelText("Importer .musart", { selector: "input" });
  fireEvent.change(input, { target: { files: [file] } });
  for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
  expect(screen.getByRole("button", { name: "Second" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Préférences" })).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Templates" }), { button: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByRole("tab", { name: "Projets" })).toHaveAttribute("aria-selected", "true");
  expect(d.services.openProject).not.toHaveBeenCalled();
  expect(d.services.openPortable).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Fermer" })).not.toBeInTheDocument();
  await act(async () => finish());
  expect(close).toHaveBeenCalledOnce();
});
test("a pending gallery open cannot race a second open or import, and cannot close after unmount", async () => {
  const d = setup(),
    close = vi.fn();
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [projectSummary(), projectSummary("b", "Second")],
    before: null,
  });
  let finish!: () => void;
  vi.mocked(d.services.openProject).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = d.mount(<ProjectDialog services={d.services} onClose={close} onTask={d.onTask} />);
  await screen.findByRole("article", { name: "Study" });
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  fireEvent.change(screen.getByLabelText("Importer .musart", { selector: "input" }), {
    target: { files: [new File(["{}"], "other.musart")] },
  });
  expect(d.services.openProject).toHaveBeenCalledExactlyOnceWith("project-a");
  expect(d.services.openPortable).not.toHaveBeenCalled();
  view.unmount();
  await act(async () => finish());
  expect(close).not.toHaveBeenCalled();
});
test("dashboard settings are an accessory that returns to the same two-tab workspace", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(<ProjectDialog services={d.services} onClose={close} onTask={d.onTask} />);
  await screen.findByText("Aucun projet enregistré.");
  fireEvent.click(screen.getByRole("button", { name: "Préférences" }));
  const settings = screen.getByRole("dialog", { name: "Préférences" });
  const shortcuts = within(settings).getByRole("tab", { name: "Raccourcis" });
  expect(shortcuts).toBeVisible();
  fireEvent.mouseDown(shortcuts, { button: 0 });
  expect(within(settings).getByPlaceholderText("Rechercher un raccourci…")).toBeVisible();
  fireEvent.click(within(settings).getByRole("button", { name: "Fermer" }));
  expect(screen.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(close).not.toHaveBeenCalled();
});

test("welcome opens the landing page and enters the library without creating a document", async () => {
  const d = setup(),
    close = vi.fn();
  d.mount(<ProjectDialog welcome services={d.services} onClose={close} onTask={d.onTask} />);
  expect(screen.getByRole("heading", { name: "Créez. Animez." })).toBeVisible();
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Commencer à créer" })[0]!);
  await screen.findByRole("dialog", { name: "Tableau de bord MusArt" });
  expect(d.services.createProject).not.toHaveBeenCalled();
  expect(d.services.saveProject).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("landing template selection uses the same guarded loader and aborts stale work", async () => {
  const d = setup(),
    close = vi.fn();
  let finish!: () => void;
  const create = vi
    .spyOn(templates, "createProjectFromTemplate")
    .mockImplementation(async (_services, _id, options) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      options?.signal?.throwIfAborted();
    });
  const origin = { projectId: "origin", pageId: "page", revision: 2 };
  const view = d.mount(
    <ProjectDialog
      welcome
      services={d.services}
      onClose={close}
      onTask={d.onTask}
      origin={origin}
    />,
  );
  const card = screen.getByRole("button", { name: "Créer depuis In Bloom — Démo Motion" });
  fireEvent.click(card);
  fireEvent.click(card);
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0]![2]!.expectedOrigin).toBe(origin);
  expect(d.services.listProjectPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(create.mock.calls[0]![2]!.signal!.aborted).toBe(true);
  await act(async () => finish());
  expect(close).not.toHaveBeenCalled();
  expect(card).not.toBeDisabled();
  fireEvent.click(card);
  const signal = create.mock.calls[1]![2]!.signal!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish());
  expect(close).not.toHaveBeenCalled();
});

test("the library brand returns to landing without modifying the open document", async () => {
  const d = setup();
  d.mount(<ProjectDialog services={d.services} onClose={vi.fn()} onTask={d.onTask} />);
  await screen.findByText("Aucun projet enregistré.");
  fireEvent.click(screen.getByRole("button", { name: "Accueil MusArt" }));
  expect(screen.getByRole("heading", { name: "Créez. Animez." })).toBeVisible();
  expect(d.services.createProject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try MusArt" }));
  expect(screen.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
});

test("recent project shortcuts share the library mutation gate", async () => {
  const d = setup(),
    close = vi.fn();
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [projectSummary()],
    before: null,
  });
  let finish!: () => void;
  vi.mocked(d.services.openProject).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  d.mount(<ProjectDialog services={d.services} onTask={d.onTask} onClose={close} />);
  const recent = await screen.findByRole("button", { name: "Ouvrir le projet récent Study" });
  fireEvent.click(recent);
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  expect(d.services.openProject).toHaveBeenCalledExactlyOnceWith("project-a");
  expect(screen.getByRole("button", { name: "Retour à l’accueil" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Templates" })).toBeDisabled();
  await act(async () => finish());
  expect(close).toHaveBeenCalledOnce();
});

test("a recent-metadata failure reports once without acquiring or looping the mutation gate", async () => {
  const d = setup();
  vi.mocked(d.services.listProjectPage).mockImplementation(async (options) => {
    if (options?.limit === 5) throw new Error("Recent metadata unavailable");
    return { projects: [], before: null };
  });
  d.mount(<ProjectDialog services={d.services} onTask={d.onTask} onClose={vi.fn()} />);
  await screen.findByText("Les projets récents sont indisponibles.");
  await screen.findByText("Aucun projet enregistré.");
  expect(
    vi.mocked(d.services.listProjectPage).mock.calls.filter(([options]) => options?.limit === 5),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Nouveau projet" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Retour à l’accueil" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await waitFor(() =>
    expect(
      vi.mocked(d.services.listProjectPage).mock.calls.filter(([options]) => options?.limit === 5),
    ).toHaveLength(2),
  );
  expect(screen.getByRole("button", { name: "Nouveau projet" })).toBeEnabled();
});

test("section changes retain header, creation controls and one search input with independent drafts", async () => {
  const d = setup();
  d.mount(
    <ProjectDialog
      projectName="Atelier"
      services={d.services}
      onTask={d.onTask}
      onClose={vi.fn()}
    />,
  );
  await screen.findByText("Aucun projet enregistré.");
  const input = screen.getByRole("searchbox", { name: "Rechercher un projet" });
  const heading = screen.getByRole("heading", { name: "Vos projets" });
  const create = screen.getByRole("button", { name: "Nouveau projet" });
  fireEvent.change(input, { target: { value: "draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Templates" }));
  expect(screen.getByRole("searchbox", { name: "Rechercher un modèle" })).toBe(input);
  expect(screen.getByRole("heading", { name: "Quel projet voulez-vous créer ?" })).toBe(heading);
  expect(screen.getByRole("button", { name: "Canvas personnalisé" })).toBe(create);
  expect(heading.closest("[inert]")).toBeNull();
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "Bloom" } });
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(screen.getByRole("searchbox")).toBe(input);
  expect(input).toHaveValue("Bloom");
  fireEvent.click(screen.getByRole("button", { name: "Projets" }));
  expect(screen.getByRole("searchbox", { name: "Rechercher un projet" })).toBe(input);
  expect(input).toHaveValue("draft");
  expect(screen.getByRole("button", { name: "Nouveau projet" })).toBe(create);
});
