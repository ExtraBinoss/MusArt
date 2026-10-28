import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createProject } from "@musart/core";
import { ProjectPill } from "../../../src/components/projects/ProjectPill";
import { setup } from "../../support/ui";
import { keybindings } from "../../../src/state/keybindings/store";
test("one project-name button opens a rename field above divided save/download actions", () => {
  const d = setup();
  d.mount(<ProjectPill engine={d.engine} services={d.services} name="Atelier" onTask={d.onTask} />);
  expect(screen.queryByLabelText("Nom du projet")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Actions du projet" });
  expect(trigger).toHaveTextContent("Atelier");
  fireEvent.click(trigger);
  expect(screen.queryByRole("button", { name: "Projets" })).not.toBeInTheDocument();
  expect(document.querySelectorAll('[data-slot="separator"]')).toHaveLength(2);
  const name = screen.getByLabelText("Nom du projet");
  fireEvent.change(name, { target: { value: "Studio" } });
  fireEvent.blur(name);
  expect(d.engine.getSnapshot().project.name).toBe("Studio");
  fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
  expect(d.services.saveProject).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Télécharger le projet .musart" }));
  expect(d.services.exportProject).toHaveBeenCalledOnce();
});
test("Escape dismisses the name popover without committing its draft", () => {
  const d = setup();
  d.mount(<ProjectPill engine={d.engine} services={d.services} name="Atelier" onTask={d.onTask} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  const name = screen.getByLabelText("Nom du projet");
  fireEvent.focus(name);
  fireEvent.change(name, { target: { value: "Cancelled" } });
  fireEvent.keyDown(name, { key: "Escape" });
  expect(d.engine.getSnapshot().project.name).toBe("Atelier");
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("blur from an obsolete project popover cannot rename a newly loaded document", () => {
  const d = setup();
  d.mount(<ProjectPill engine={d.engine} services={d.services} name="Atelier" onTask={d.onTask} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  const name = screen.getByLabelText("Nom du projet");
  fireEvent.change(name, { target: { value: "Old draft" } });
  const next = createProject({ name: "Other document" });
  act(() => d.engine.load(next));
  const original = d.engine.getSnapshot();
  fireEvent.blur(name);
  expect(d.engine.getSnapshot()).toBe(original);
});
test("a deferred rename rechecks its original project before executing", () => {
  const d = setup();
  let pending: (() => void | Promise<void>) | undefined;
  d.mount(
    <ProjectPill
      engine={d.engine}
      services={d.services}
      name="Atelier"
      onTask={async (task) => {
        pending = task;
        return true;
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  fireEvent.change(screen.getByLabelText("Nom du projet"), { target: { value: "Old draft" } });
  fireEvent.blur(screen.getByLabelText("Nom du projet"));
  act(() => d.engine.load(createProject({ name: "Replacement" })));
  const original = d.engine.getSnapshot();
  act(() => {
    void pending?.();
  });
  expect(d.engine.getSnapshot()).toBe(original);
});

test("save keycaps follow real overrides and disappear when the binding is removed", () => {
  const d = setup();
  d.mount(<ProjectPill engine={d.engine} services={d.services} name="Atelier" onTask={d.onTask} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions du projet" }));
  const button = screen.getByRole("button", { name: /Enregistrer/ });
  try {
    act(() =>
      keybindings.assign("action:save", [{ key: "F8", mod: false, alt: false, shift: true }]),
    );
    expect(
      Array.from(button.querySelectorAll('[data-slot="kbd"]')).map((node) => node.textContent),
    ).toEqual(["Shift", "F8"]);
    act(() => keybindings.assign("action:save", []));
    expect(button.querySelector("kbd")).toBeNull();
  } finally {
    act(() => keybindings.reset());
  }
});
