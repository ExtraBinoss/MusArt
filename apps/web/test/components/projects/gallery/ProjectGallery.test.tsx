import { LIBRARY_MODE_KEY } from "../../../../src/components/projects/dashboard/library-mode";
import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen, within, waitFor } from "@testing-library/react";
import { ProjectGallery } from "../../../../src/components/projects/gallery/ProjectGallery";
import { projectSummary } from "../../../support/projects";
import { setup } from "../../../support/ui";
async function action(project: string, label: string) {
  const card = screen.getByRole("article", { name: project });
  const trigger = within(card).getByRole("button", { name: "Options du projet" });
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
  });
  const item = await screen.findByRole("menuitem", { name: label });
  await act(async () => fireEvent.click(item));
}
test("loads bounded pages, mutates inactive projects and confirms history clearing separately from deleting", async () => {
  const d = setup(),
    open = vi.fn(),
    create = vi.fn(),
    a = projectSummary(),
    b = projectSummary("b", "Second");
  vi.mocked(d.services.listProjectPage).mockResolvedValue({ projects: [a], before: ["2026", "a"] });
  d.mount(
    <ProjectGallery
      services={d.services}
      activeProjectId={a.id}
      onTask={d.onTask}
      onOpen={open}
      onCreate={create}
    />,
  );
  await screen.findByRole("article", { name: "Study" });
  expect(d.services.listProjectPage).toHaveBeenCalledWith({ limit: 24 });
  expect(d.services.projectInsights).not.toHaveBeenCalled();
  vi.mocked(d.services.listProjectPage).mockResolvedValueOnce({ projects: [b, a], before: null });
  fireEvent.click(screen.getByRole("button", { name: "Afficher plus de projets" }));
  await screen.findByRole("article", { name: "Second" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  await action("Second", "Renommer le projet");
  fireEvent.change(screen.getByLabelText("Renommer le projet"), {
    target: { value: "Inactive renamed" },
  });
  fireEvent.keyDown(screen.getByLabelText("Renommer le projet"), { key: "Enter" });
  await waitFor(() =>
    expect(d.services.renameProject).toHaveBeenCalledWith("b", "Inactive renamed"),
  );
  await screen.findByRole("article", { name: "Study" });
  await action("Study", "Dupliquer");
  await waitFor(() => expect(d.services.duplicateProject).toHaveBeenCalledWith(a.id));
  await action("Study", "Effacer l’historique");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(d.services.clearHistory).not.toHaveBeenCalled();
  await action("Study", "Effacer l’historique");
  fireEvent.click(screen.getByRole("button", { name: "Effacer le journal" }));
  await waitFor(() => expect(d.services.clearHistory).toHaveBeenCalledWith(a.id));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await action("Study", "Stockage du projet");
  await screen.findByText("Détail du journal");
  fireEvent.click(screen.getByRole("button", { name: "Effacer l’historique" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await action("Study", "Supprimer");
  fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
  await waitFor(() => expect(d.services.deleteProject).toHaveBeenCalledWith(a.id));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  await waitFor(() => expect(open).toHaveBeenCalledOnce());
});
test("recovers local listing failures and exposes real project creation when empty", async () => {
  const d = setup(),
    create = vi.fn();
  vi.mocked(d.services.listProjectPage)
    .mockRejectedValueOnce(new Error("disk"))
    .mockResolvedValue({ projects: [], before: null });
  d.mount(
    <ProjectGallery
      services={d.services}
      onTask={d.onTask}
      onOpen={() => undefined}
      onCreate={create}
    />,
  );
  await screen.findByText("Les projets locaux ne sont pas accessibles.");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await screen.findByText("Aucun projet enregistré.");
  fireEvent.click(screen.getByRole("button", { name: "Nouveau projet" }));
  expect(create).toHaveBeenCalledOnce();
});

test("guards two concurrent opens and suppresses completion callbacks after unmount", async () => {
  const d = setup(),
    open = vi.fn();
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
  const view = d.mount(
    <ProjectGallery
      services={d.services}
      onTask={d.onTask}
      onOpen={open}
      onCreate={() => undefined}
    />,
  );
  await screen.findByRole("article", { name: "Study" });
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  expect(d.services.openProject).toHaveBeenCalledExactlyOnceWith("project-a");
  expect(screen.getByRole("button", { name: "Second" })).toBeDisabled();
  view.unmount();
  await act(async () => finish());
  expect(open).not.toHaveBeenCalled();
});

test("search filters loaded metadata and still allows bounded pagination for absent results", async () => {
  const d = setup(),
    open = vi.fn();
  vi.mocked(d.services.listProjectPage)
    .mockResolvedValueOnce({ projects: [projectSummary()], before: ["2026", "a"] })
    .mockResolvedValueOnce({ projects: [projectSummary("b", "Second")], before: null });
  d.mount(
    <ProjectGallery services={d.services} onTask={d.onTask} onOpen={open} onCreate={vi.fn()} />,
  );
  await screen.findByRole("article", { name: "Study" });
  fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher un projet" }), {
    target: { value: "SECOND" },
  });
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.getByText(/Aucun projet correspondant parmi les éléments chargés/)).toBeVisible();
  expect(d.services.listProjectPage).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Afficher plus de projets" }));
  await screen.findByRole("article", { name: "Second" });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(d.services.listProjectPage).toHaveBeenLastCalledWith({ limit: 24, before: ["2026", "a"] });
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  await waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(d.services.openProject).toHaveBeenCalledWith("b");
});

test("external query filtering reuses bounded metadata and can hide the gallery-owned search", async () => {
  const d = setup(),
    loaded = vi.fn();
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [projectSummary(), projectSummary("b", "Second")],
    before: null,
  });
  const props = {
    services: d.services,
    onTask: d.onTask,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    hideSearch: true,
    onProjectsLoaded: loaded,
  };
  const view = d.mount(<ProjectGallery {...props} query="Study" />);
  await screen.findByRole("article", { name: "Study" });
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("article", { name: "Second" })).toBeNull();
  expect(loaded).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: "project-a" }),
      expect.objectContaining({ id: "b" }),
    ]),
  );
  view.rerender(<ProjectGallery {...props} query="Second" />);
  expect(screen.getByRole("article", { name: "Second" })).toBeInTheDocument();
  expect(d.services.listProjectPage).toHaveBeenCalledOnce();
});

beforeEach(() => localStorage.removeItem(LIBRARY_MODE_KEY));

test("filters loaded project metadata, remembers the user choice and keeps legacy projects Static", async () => {
  const d = setup();
  const still = projectSummary("still", "Static study");
  const motion = projectSummary("motion", "Motion study");
  motion.pages[1]!.mode = "motion";
  vi.mocked(d.services.listProjectPage).mockResolvedValue({
    projects: [still, motion],
    before: null,
  });
  const props = { services: d.services, onTask: d.onTask, onOpen: vi.fn(), onCreate: vi.fn() };
  const view = d.mount(<ProjectGallery {...props} />);
  await screen.findByRole("article", { name: "Static study" });
  expect(screen.getByRole("radio", { name: "Tous" })).toBeChecked();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(screen.queryByRole("article", { name: "Static study" })).toBeNull();
  await waitFor(() => expect(screen.getByRole("article", { name: "Motion study" })).toBeVisible());
  expect(localStorage.getItem(LIBRARY_MODE_KEY)).toBe("motion");
  expect(d.services.listProjectPage).toHaveBeenCalledTimes(1);
  view.unmount();
  d.mount(<ProjectGallery {...props} />);
  await screen.findByRole("article", { name: "Motion study" });
  expect(screen.getByRole("radio", { name: "Motion" })).toBeChecked();
  expect(screen.queryByRole("article", { name: "Static study" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  await waitFor(() => expect(screen.getByRole("article", { name: "Static study" })).toBeVisible());
  expect(screen.queryByRole("article", { name: "Motion study" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Tous" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(d.services.listProjectPage).toHaveBeenCalledTimes(2);
});
