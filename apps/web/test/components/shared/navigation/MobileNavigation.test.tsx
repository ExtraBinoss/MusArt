import { expect, test, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { MobileNavigation } from "../../../../src/components/shared/navigation/MobileNavigation";
import { setup } from "../../../support/ui";

const items = [
  { value: "projects", label: "Projects", icon: <svg /> },
  { value: "templates", label: "Templates", icon: <svg /> },
  { value: "community", label: "Community", icon: <svg />, badge: "Soon", disabled: true },
  { value: "preferences", label: "Preferences", icon: <svg /> },
];
test("uses ordinary accessible buttons, a disabled community and one local selection", () => {
  const choose = vi.fn();
  setup().mount(
    <MobileNavigation label="Library" value="projects" items={items} onSelect={choose} />,
  );
  const nav = screen.getByRole("navigation", { name: "Library" });
  expect(within(nav).getByRole("button", { name: "Projects" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const community = within(nav).getByRole("button", { name: "Community · Soon" });
  expect(community).toBeDisabled();
  fireEvent.click(community);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(within(nav).getByRole("button", { name: "Templates" }));
  expect(choose).toHaveBeenCalledOnce();
  expect(choose.mock.calls[0]![0]).toBe("templates");
  expect(nav.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
});
test("arrow, Home and End focus enabled buttons without activating a section", () => {
  const choose = vi.fn();
  setup().mount(
    <MobileNavigation label="Library" value="projects" items={items} onSelect={choose} />,
  );
  const projects = screen.getByRole("button", { name: "Projects" });
  projects.focus();
  fireEvent.keyDown(projects, { key: "ArrowLeft" });
  expect(screen.getByRole("button", { name: "Preferences" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  fireEvent.keyDown(projects, { key: "ArrowRight" });
  const templates = screen.getByRole("button", { name: "Templates" });
  expect(templates).toHaveFocus();
  fireEvent.keyDown(templates, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Preferences" })).toHaveFocus();
  expect(choose).not.toHaveBeenCalled();
});
test("editor instances retain expanded semantics and globally disabled navigation", () => {
  setup().mount(
    <>
      <MobileNavigation
        label="Editor"
        value="projects"
        items={items}
        selection="expanded"
        onSelect={vi.fn()}
      />
      <MobileNavigation
        label="Busy library"
        value="templates"
        items={items}
        disabled
        onSelect={vi.fn()}
      />
    </>,
  );
  const editor = screen.getByRole("navigation", { name: "Editor" });
  expect(within(editor).getByRole("button", { name: "Projects" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(editor.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
  const busy = screen.getByRole("navigation", { name: "Busy library" });
  for (const button of within(busy).getAllByRole("button")) expect(button).toBeDisabled();
  expect(busy.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
});
