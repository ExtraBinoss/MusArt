import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EditorEngine } from "@musart/core";
import { useTimelinePreferences } from "../../../src/components/motion/preferences";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import type { ProjectLayoutPreferences } from "../../../src/services/projects/preferences/model";

afterEach(() => vi.unstubAllGlobals());

test("restores zoom and responsive height, with one committed resize and no document edit", async () => {
  vi.stubGlobal("innerHeight", 800);
  const engine = new EditorEngine();
  const before = engine.getSnapshot();
  const port = {
    read: vi.fn().mockResolvedValue({ timelineZoom: 320, timelineHeight: 0.4 }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  function Probe() {
    const preferences = useTimelinePreferences(engine);
    return (
      <>
        <output>
          {preferences.zoom}:{preferences.height}
        </output>
        <button
          onClick={() => {
            preferences.protectHeight();
            preferences.setHeight(380);
          }}
        >
          Preview
        </button>
        <button onClick={() => preferences.saveHeight(preferences.height)}>Commit</button>
        <button onClick={preferences.fitHeight}>Fit</button>
      </>
    );
  }
  render(
    <ProjectPreferencesProvider projectId={before.project.id} port={port} onError={vi.fn()}>
      <Probe />
    </ProjectPreferencesProvider>,
  );
  await screen.findByText("320:320");
  fireEvent.click(screen.getByText("Preview"));
  expect(screen.getByText("320:380")).toBeVisible();
  expect(port.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Commit"));
  await act(() => Promise.resolve());
  expect(port.update).toHaveBeenCalledExactlyOnceWith(before.project.id, { timelineHeight: 0.475 });
  vi.stubGlobal("innerHeight", 1000);
  fireEvent.click(screen.getByText("Fit"));
  expect(screen.getByText("320:475")).toBeVisible();
  expect(port.update).toHaveBeenCalledOnce();
  expect(engine.getSnapshot()).toBe(before);
});

test("a slider gesture before hydration keeps its newer zoom and commits once", async () => {
  const engine = new EditorEngine();
  let resolve!: (values: ProjectLayoutPreferences) => void;
  const reading = new Promise<ProjectLayoutPreferences>((done) => {
    resolve = done;
  });
  const port = { read: () => reading, update: vi.fn().mockResolvedValue(undefined) };
  function Probe() {
    const preferences = useTimelinePreferences(engine);
    return (
      <>
        <output>{preferences.zoom}</output>
        <button
          onClick={() => {
            preferences.protectZoom();
            preferences.setZoom(400);
          }}
        >
          Preview
        </button>
        <button onClick={() => preferences.saveZoom(preferences.zoom)}>Commit</button>
      </>
    );
  }
  render(
    <ProjectPreferencesProvider
      projectId={engine.getSnapshot().project.id}
      port={port}
      onError={vi.fn()}
    >
      <Probe />
    </ProjectPreferencesProvider>,
  );
  fireEvent.click(screen.getByText("Preview"));
  await act(async () => {
    resolve({ timelineZoom: 200 });
    await reading;
  });
  expect(screen.getByText("400")).toBeVisible();
  expect(port.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Commit"));
  await act(() => Promise.resolve());
  expect(port.update).toHaveBeenCalledExactlyOnceWith(engine.getSnapshot().project.id, {
    timelineZoom: 400,
  });
});
