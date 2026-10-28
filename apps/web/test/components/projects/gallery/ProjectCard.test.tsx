import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
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
    insights = vi.fn(),
    clear = vi.fn();
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
      onClearHistory={clear}
    />,
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Options du projet" })).toHaveClass(
    "project-options-trigger",
  );
  fireEvent.click(screen.getByRole("button", { name: "Study" }));
  expect(open).toHaveBeenCalledOnce();
  await menu("Renommer le projet");
  const input = screen.getByLabelText("Renommer le projet");
  fireEvent.change(input, { target: { value: "Renamed" } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  expect(rename).toHaveBeenCalledExactlyOnceWith("Renamed");
  for (const [label, fn] of [
    ["Dupliquer", copy],
    ["Stockage du projet", insights],
    ["Effacer l’historique", clear],
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
      onClearHistory={() => undefined}
    />,
  );
  expect(screen.getByText("Ouvert")).toBeVisible();
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
