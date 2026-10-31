import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ProjectCard } from "../../../../src/components/projects/gallery/ProjectCard";
import { projectSummary } from "../../../support/projects";
import { setup } from "../../../support/ui";
async function menu(label: string) {
  fireEvent.pointerDown(screen.getByLabelText("Options du projet"), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}
test("exposes complete inactive-project CRUD and storage actions through real menus", async () => {
  const d = setup(),
    open = vi.fn(),
    rename = vi.fn().mockResolvedValue(true),
    copy = vi.fn(),
    remove = vi.fn(),
    insights = vi.fn();
  d.mount(
    <ProjectCard
      project={projectSummary()}
      services={d.services}
      active={false}
      onOpen={open}
      onRename={rename}
      onDuplicate={copy}
      onDelete={remove}
      onInsights={insights}
    />,
  );
  fireEvent.pointerDown(screen.getByLabelText("Options du projet"), { button: 0, ctrlKey: false });
  const storage = await screen.findByRole("menuitem", { name: "Stockage du projet" });
  expect(storage.querySelector("svg")).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Effacer l’historique" })).toBeNull();
  expect(screen.getAllByRole("menuitem").at(-1)).toBe(storage);
  expect(screen.getByRole("menuitem", { name: "Supprimer" }).querySelector("svg")).not.toBeNull();
  fireEvent.keyDown(storage, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Options du projet" })).toHaveClass(
    "project-options-trigger",
  );
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  expect(open).toHaveBeenCalledOnce();
  await menu("Renommer le projet");
  const input = screen.getByLabelText("Renommer le projet");
  await waitFor(() => {
    expect(screen.queryByRole("menu", { hidden: true })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });
  fireEvent.change(input, { target: { value: "Renamed" } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  expect(rename).toHaveBeenCalledExactlyOnceWith("Renamed");
  for (const [label, fn] of [
    ["Dupliquer", copy],
    ["Stockage du projet", insights],
    ["Supprimer", remove],
  ] as const) {
    await menu(label);
    expect(fn).toHaveBeenCalledOnce();
  }
});
test("supports F2, Escape, empty names, blur and a failed rename without losing editing", async () => {
  const d = setup(),
    rename = vi.fn().mockResolvedValue(false);
  d.mount(
    <ProjectCard
      project={projectSummary()}
      services={d.services}
      active
      onOpen={() => undefined}
      onRename={rename}
      onDuplicate={() => undefined}
      onDelete={() => undefined}
      onInsights={() => undefined}
    />,
  );
  expect(screen.getByRole("article", { name: "Study" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByText("Statique")).toBeVisible();
  fireEvent.keyDown(screen.getByRole("button", { name: "Study" }), { key: "F2" });
  fireEvent.change(screen.getByLabelText("Renommer le projet"), { target: { value: "Cancelled" } });
  fireEvent.keyDown(screen.getByLabelText("Renommer le projet"), { key: "Escape" });
  expect(rename).not.toHaveBeenCalled();
  await menu("Renommer le projet");
  fireEvent.blur(screen.getByLabelText("Renommer le projet"), { target: { value: " " } });
  expect(rename).not.toHaveBeenCalled();
  await menu("Renommer le projet");
  fireEvent.change(screen.getByLabelText("Renommer le projet"), { target: { value: "Retry" } });
  await act(async () => {
    fireEvent.blur(screen.getByLabelText("Renommer le projet"));
  });
  expect(screen.getByLabelText("Renommer le projet")).not.toBeDisabled();
  expect(rename).toHaveBeenCalledWith("Retry");
});

test("matches template captions with name, resolution and the actual mode without date or page-count rows", () => {
  const d = setup();
  const props = {
    services: d.services,
    active: false,
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onInsights: vi.fn(),
    onClearHistory: vi.fn(),
  };
  const project = projectSummary();
  const view = d.mount(<ProjectCard {...props} project={project} />);
  expect(screen.getByRole("button", { name: "Study" })).toBeVisible();
  expect(screen.getByText("320 × 220 px")).toBeVisible();
  expect(screen.getByText("Statique").closest("[data-mode]")).toHaveAttribute(
    "data-mode",
    "static",
  );
  expect(document.querySelector("time,.active-project-badge")).toBeNull();
  expect(document.querySelector(".project-card-details")).toHaveTextContent("320 × 220 pxStatique");
  view.rerender(
    <ProjectCard
      {...props}
      project={{
        ...project,
        mode: "motion",
        pages: project.pages.map((page) => ({ ...page, mode: "motion" })),
      }}
    />,
  );
  const mode = screen.getByText("Motion").closest("[data-mode]");
  expect(mode).toHaveAttribute("data-mode", "motion");
  expect(mode?.querySelector("svg")).toHaveAttribute("viewBox", "0 0 24 24");
  view.rerender(
    <ProjectCard
      {...props}
      project={{
        ...project,
        pages: project.pages.map((page, index) => ({
          ...page,
          mode: index === 1 ? "motion" : "static",
        })),
      }}
    />,
  );
  expect(screen.getByText("Motion")).toBeVisible();
});

test("caption resolution follows the displayed Motion artboard and falls back to Static page or summary dimensions", () => {
  const d = setup();
  const props = {
    services: d.services,
    active: false,
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onInsights: vi.fn(),
    onClearHistory: vi.fn(),
  };
  const project = projectSummary();
  const mixed = {
    ...project,
    pages: project.pages.map((page, index) =>
      index === 1
        ? { ...page, mode: "motion" as const, width: 1920, height: 1080 }
        : { ...page, mode: "static" as const },
    ),
  };
  const view = d.mount(<ProjectCard {...props} project={mixed} />);
  expect(screen.getByText("1920 × 1080 px")).toBeVisible();
  expect(screen.queryByText("320 × 220 px")).toBeNull();
  view.rerender(
    <ProjectCard
      {...props}
      project={{ ...project, pages: [{ ...project.pages[0]!, width: 600, height: 800 }] }}
    />,
  );
  expect(screen.getByText("600 × 800 px")).toBeVisible();
  view.rerender(<ProjectCard {...props} project={{ ...project, pages: [] }} />);
  expect(screen.getByText("320 × 220 px")).toBeVisible();
});

test("right click opens the same project actions without triggering a preview", async () => {
  const d = setup(),
    open = vi.fn(),
    duplicate = vi.fn();
  d.mount(
    <ProjectCard
      project={projectSummary()}
      services={d.services}
      active={false}
      onOpen={open}
      onRename={vi.fn()}
      onDuplicate={duplicate}
      onDelete={vi.fn()}
      onInsights={vi.fn()}
    />,
  );
  fireEvent.contextMenu(screen.getByRole("article"), { clientX: 180, clientY: 120 });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dupliquer" }));
  expect(duplicate).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});
