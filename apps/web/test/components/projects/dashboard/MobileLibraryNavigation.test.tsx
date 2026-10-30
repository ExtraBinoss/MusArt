import { useRef, useState } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { MobileLibraryNavigation } from "../../../../src/components/projects/dashboard/MobileLibraryNavigation";
import { setup } from "../../../support/ui";

function pointer(target: EventTarget, type: string, x: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: x,
    clientY: 200,
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    isPrimary: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}
test("swipe presents without React commits, focuses an exiting card's destination and selects once", () => {
  let renders = 0;
  const selected = vi.fn();
  function Host() {
    renders++;
    const [view, setView] = useState<"projects" | "templates">("projects");
    const surface = useRef<HTMLDivElement>(null),
      content = useRef<HTMLDivElement>(null);
    return (
      <div ref={surface} data-testid="surface">
        <input aria-label="Search" defaultValue="draft" />
        <div ref={content}>
          <button>Old card</button>
          <span>{view}</span>
        </div>
        <MobileLibraryNavigation
          view={view}
          busy={false}
          preferences={false}
          surface={surface}
          content={content}
          onViewChange={(value) => {
            selected(value);
            setView(value);
          }}
          onPreferences={vi.fn()}
        />
      </div>
    );
  }
  const mounted = setup().mount(<Host />);
  const surface = screen.getByTestId("surface");
  Object.defineProperty(surface, "clientWidth", { value: 390 });
  screen.getByRole("button", { name: "Old card" }).focus();
  const before = renders;
  pointer(surface, "pointerdown", 300);
  pointer(window, "pointermove", 190);
  expect(renders).toBe(before);
  expect(selected).not.toHaveBeenCalled();
  pointer(window, "pointerup", 170);
  expect(selected).toHaveBeenCalledExactlyOnceWith("templates");
  const stage = screen.getByRole("button", { name: "Old card" }).parentElement!;
  expect(stage.style.transform).toContain("translate3d(");
  expect(screen.getByRole("button", { name: "Templates" })).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("draft");
  mounted.unmount();
  expect(stage.style.transform).toBe("");
});
test("preferences reuses its existing action, pending work disables activation and search keeps focus", () => {
  const preferences = vi.fn(),
    change = vi.fn();
  function Host({ busy = false }: { busy?: boolean }) {
    const surface = useRef<HTMLDivElement>(null),
      content = useRef<HTMLDivElement>(null);
    return (
      <div ref={surface} data-testid="surface">
        <input aria-label="Search" />
        <div ref={content}>Results</div>
        <MobileLibraryNavigation
          view="projects"
          busy={busy}
          preferences={false}
          surface={surface}
          content={content}
          onViewChange={change}
          onPreferences={preferences}
        />
      </div>
    );
  }
  const view = setup().mount(<Host />);
  const nav = screen.getByRole("navigation", { name: "Navigation de l’atelier" });
  fireEvent.click(within(nav).getByRole("button", { name: "Préférences" }));
  expect(preferences).toHaveBeenCalledOnce();
  expect(within(nav).getByRole("button", { name: "Préférences" })).toHaveAttribute(
    "aria-haspopup",
    "dialog",
  );
  expect(within(nav).getByRole("button", { name: "Communauté · Bientôt" })).toBeDisabled();
  const input = screen.getByRole("textbox", { name: "Search" });
  input.focus();
  const surface = screen.getByTestId("surface");
  Object.defineProperty(surface, "clientWidth", { value: 390 });
  pointer(surface, "pointerdown", 300);
  pointer(window, "pointerup", 160);
  expect(input).toHaveFocus();
  expect(change).toHaveBeenCalledOnce();
  view.rerender(<Host busy />);
  for (const button of within(nav).getAllByRole("button")) expect(button).toBeDisabled();
});

test("programmatic page activation moves retained card focus before the old content exits", () => {
  const change = vi.fn();
  function Host() {
    const surface = useRef<HTMLDivElement>(null),
      content = useRef<HTMLDivElement>(null);
    return (
      <div ref={surface}>
        <div ref={content}>
          <button>Focused card</button>
        </div>
        <MobileLibraryNavigation
          view="projects"
          busy={false}
          preferences={false}
          surface={surface}
          content={content}
          onViewChange={change}
          onPreferences={vi.fn()}
        />
      </div>
    );
  }
  setup().mount(<Host />);
  screen.getByRole("button", { name: "Focused card" }).focus();
  const templates = screen.getByRole("button", { name: "Templates" });
  fireEvent.click(templates);
  expect(templates).toHaveFocus();
  expect(change).toHaveBeenCalledExactlyOnceWith("templates");
});
