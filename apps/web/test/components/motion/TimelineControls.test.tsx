import { Profiler, useState, useSyncExternalStore } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { TimelineControls } from "../../../src/components/motion/TimelineControls";
import type { TimelineUnit } from "../../../src/components/motion/model";
import { makeTransport } from "./support";

function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  function Host() {
    const snapshot = useSyncExternalStore(d.engine.subscribe, d.engine.getSnapshot);
    const [unit, setUnit] = useState<TimelineUnit>("ms");
    return (
      <TimelineControls
        engine={d.engine}
        snapshot={snapshot}
        transport={runtime.transport}
        unit={unit}
        onUnit={() => setUnit((value) => (value === "s" ? "ms" : "s"))}
      />
    );
  }
  return { d, runtime, Host };
}

it("runs real play/pause, playback choice, unit conversion and arbitrary-time jump handlers", () => {
  const { d, runtime, Host } = fixture();
  d.mount(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "Lire" }));
  expect(runtime.transport.play).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(runtime.transport.pause).toHaveBeenCalledOnce();
  const autoKey = screen.getByRole("button", { name: "Images clés automatiques" });
  expect(autoKey).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(autoKey);
  expect(autoKey).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(autoKey);
  expect(autoKey).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Mode de lecture · Une fois" }));
  fireEvent.click(screen.getByRole("radio", { name: "Boucle" }));
  expect(runtime.transport.setPlaybackMode).toHaveBeenCalledWith("loop");
  const field = screen.getByRole("spinbutton", { name: "Temps actuel" });
  fireEvent.change(field, { target: { value: "1250" } });
  fireEvent.blur(field);
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 5, rate: 4 });
  fireEvent.click(screen.getByRole("button", { name: "Unité de temps" }));
  expect(field).toHaveValue(1.25);
  const calls = vi.mocked(runtime.transport.seek).mock.calls.length;
  fireEvent.change(field, { target: { value: "99" } });
  fireEvent.blur(field);
  expect(runtime.transport.seek).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole("alert")).toHaveTextContent("temps valide");
});

it("commits one duration command, keeps cancel/stale edits atomic and rejects invalid length", () => {
  const { d, runtime, Host } = fixture();
  d.mount(<Host />);
  const duration = screen.getByRole("spinbutton", { name: "Durée de composition" });
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "4000" } });
  fireEvent.blur(duration);
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.duration).toEqual({ value: 4, rate: 1 });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.duration).toEqual({ value: 2, rate: 1 });
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "6000" } });
  const before = d.engine.getSnapshot();
  fireEvent.keyDown(duration, { key: "Escape" });
  expect(d.engine.getSnapshot()).toBe(before);
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "0" } });
  fireEvent.blur(duration);
  expect(screen.getByRole("alert")).toHaveTextContent("supérieure à zéro");
  expect(d.engine.getSnapshot()).toBe(before);
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "5000" } });
  act(() => d.engine.execute({ type: "renameProject", name: "new revision" }));
  const revised = d.engine.getSnapshot();
  fireEvent.blur(duration);
  expect(d.engine.getSnapshot()).toBe(revised);
  expect(screen.getByRole("alert")).toHaveTextContent("composition a changé");
  expect(runtime.transport.seek).not.toHaveBeenCalled();
});

it("rejects a duration draft from another project even when page ID and revision match", () => {
  const { d, Host } = fixture();
  d.mount(<Host />);
  const duration = screen.getByRole("spinbutton", { name: "Durée de composition" });
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "6000" } });
  const before = d.engine.getSnapshot();
  const replacement = {
    ...before,
    project: { ...before.project, id: `${before.project.id}-replacement` },
  };
  vi.spyOn(d.engine, "getSnapshot").mockReturnValue(replacement);
  const execute = vi.spyOn(d.engine, "execute");
  fireEvent.blur(duration);
  expect(execute).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(replacement);
  expect(replacement.project.pages[0]!.motion!.duration).toEqual({ value: 2, rate: 1 });
  expect(screen.getByRole("alert")).toHaveTextContent("composition a changé");
});

it("reports a rejected duration command without simulating an applied edit", () => {
  const { d, Host } = fixture();
  d.mount(<Host />);
  const duration = screen.getByRole("spinbutton", { name: "Durée de composition" });
  act(() => duration.focus());
  fireEvent.change(duration, { target: { value: "6000" } });
  const before = d.engine.getSnapshot();
  vi.spyOn(d.engine, "execute").mockImplementation(() => {
    throw new Error("Document busy");
  });
  fireEvent.blur(duration);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(screen.getByRole("alert")).toHaveTextContent("n’a pas pu être appliquée");
});

it("shows the dragged key time without seeking or committing React frames and restores the transport time", () => {
  const { d, runtime, Host } = fixture(),
    commits = vi.fn();
  const view = d.mount(
    <Profiler id="controls" onRender={commits}>
      <Host />
    </Profiler>,
  );
  act(() => runtime.update({ time: { value: 1, rate: 1 } }));
  const field = screen.getByRole("spinbutton", { name: "Temps actuel" });
  const before = commits.mock.calls.length,
    snapshot = d.engine.getSnapshot();
  act(() => {
    for (let value = 2001; value <= 2060; value++) runtime.editTime({ value, rate: 1000 });
  });
  expect(screen.getByRole("spinbutton", { name: "Temps de l’image clé" })).toBe(field);
  expect(field).toHaveValue(2060);
  expect(runtime.transport.read().time).toEqual({ value: 1, rate: 1 });
  expect(runtime.transport.seek).not.toHaveBeenCalled();
  expect(commits.mock.calls.length).toBe(before);
  expect(d.engine.getSnapshot()).toBe(snapshot);
  act(() => runtime.editTime(null));
  expect(screen.getByRole("spinbutton", { name: "Temps actuel" })).toHaveValue(1000);
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
  runtime.editTime({ value: 4, rate: 1 });
  expect(field).toHaveValue(1000);
});
