import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LibraryToolbar } from "../../../../src/components/projects/dashboard/LibraryToolbar";
import { setup } from "../../../support/ui";
import { projectSummary } from "../../../support/projects";

test("retains the actual search input while changing sections and template modes", () => {
  const d = setup(),
    query = vi.fn(),
    mode = vi.fn();
  const common = {
    onQueryChange: query,
    onModeChange: mode,
    projects: [projectSummary()],
    disabled: false,
  };
  const view = d.mount(<LibraryToolbar {...common} view="projects" query="Study" mode="static" />);
  const input = screen.getByRole("searchbox", { name: "Rechercher un projet" });
  expect(screen.getByRole("radio", { name: "Tous" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  view.rerender(<LibraryToolbar {...common} view="templates" query="" mode="static" />);
  expect(screen.getByRole("searchbox", { name: "Rechercher un modèle" })).toBe(input);
  expect(input).toHaveValue("");
  expect(document.querySelector('img[src="/templates/motion/in-bloom.webp"]')).toBeNull();
  fireEvent.change(input, { target: { value: "Bloom" } });
  expect(query).toHaveBeenCalledExactlyOnceWith("Bloom");
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(mode).toHaveBeenCalledExactlyOnceWith("motion");
  view.rerender(<LibraryToolbar {...common} view="templates" query="" mode="motion" />);
  expect(screen.getByRole("searchbox")).toBe(input);
  expect(document.querySelector('img[src="/templates/motion/in-bloom.webp"]')).not.toBeNull();
  expect(screen.getByRole("radio", { name: "Motion" })).toBeChecked();
});
test("disables the retained search and mode controls during a real operation", () => {
  const d = setup();
  d.mount(
    <LibraryToolbar
      view="templates"
      query=""
      onQueryChange={vi.fn()}
      mode="static"
      onModeChange={vi.fn()}
      projects={[]}
      disabled
    />,
  );
  expect(screen.getByRole("searchbox")).toBeDisabled();
  for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
});
