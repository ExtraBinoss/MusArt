import { useSyncExternalStore } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { setup } from "../../support/ui";
import { CompositionMode } from "../../../src/components/motion/CompositionMode";

it("requires the counted fourth item, cancels atomically and preserves repeated mode changes", () => {
  const d = setup(),
    enabled = vi.fn();
  d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  function Host() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return <CompositionMode engine={d.engine} snapshot={snapshot} onMotionEnabled={enabled} />;
  }
  d.mount(<Host />);
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("4 éléments");
  fireEvent.click(screen.getByRole("button", { name: "Non, garder le mode statique" }));
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  const tracks = d.engine.getSnapshot().project.pages[0]!.motion!.tracks;
  expect(tracks).toHaveLength(4);
  expect(enabled).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks).toEqual(tracks);
});

it("initializes three items directly and rejects stale confirmation after an edit", () => {
  const d = setup();
  function Host() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return <CompositionMode engine={d.engine} snapshot={snapshot} />;
  }
  d.mount(<Host />);
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks).toHaveLength(3);
});

it("shows a truthful stale error rather than applying the old counted operation", () => {
  const d = setup();
  d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  function Host() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return <CompositionMode engine={d.engine} snapshot={snapshot} />;
  }
  d.mount(<Host />);
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  act(() => d.engine.execute({ type: "renameProject", name: "new revision" }));
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("alert")).toHaveTextContent("La composition a changé");
});

it("the mobile primary action uses the same counted confirmation and one validated mode command", () => {
  const d = setup(),
    enabled = vi.fn();
  d.engine.execute({ type: "addLayers", layers: [createLayer("rectangle")] });
  function Host() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    return (
      <CompositionMode
        engine={d.engine}
        snapshot={snapshot}
        presentation="button"
        buttonLabel="Passer en mode Motion"
        onMotionEnabled={enabled}
      />
    );
  }
  d.mount(<Host />);
  expect(screen.queryByRole("radiogroup")).toBeNull();
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Passer en mode Motion" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("4 éléments");
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Oui, activer Motion" }));
  expect(enabled).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks).toHaveLength(4);
  expect(screen.getByRole("radio", { name: "Motion" })).toBeChecked();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.motion).toBeUndefined();
});
