import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, renderHook } from "@testing-library/react";
import { EditorEngine } from "@musart/core";
import {
  useTimelinePreferences,
  useTimelineRangeZoom,
  useTimelineCollapsedRows,
} from "../../../src/components/motion/preferences";
import { ProjectPreferencesProvider } from "../../../src/components/workspace/preferences/context";
import type { ProjectLayoutPreferences } from "../../../src/services/projects/preferences/model";

afterEach(() => vi.unstubAllGlobals());

test("collapsed row actions stay stable and never mutate an earlier presentation snapshot", () => {
  const probe = renderHook(() => useTimelineCollapsedRows()),
    original = probe.result.current.collapsed;
  const toggle = probe.result.current.toggle;
  act(() => toggle("layer"));
  expect(probe.result.current.collapsed.has("layer")).toBe(true);
  expect(original.size).toBe(0);
  probe.rerender();
  expect(probe.result.current.toggle).toBe(toggle);
  act(() => toggle("layer"));
  expect(probe.result.current.collapsed.size).toBe(0);
});

test("range zoom remains stable across scroll renders and retains its pointer anchor at the maximum", () => {
  const options = {
    zoom: 120,
    width: 800,
    actionWidth: 144,
    protectZoom: vi.fn(),
    saveZoom: vi.fn(),
    setZoom: vi.fn(),
    viewport: { current: document.createElement("div") },
    horizontalScroll: { current: 0 },
    desiredZoom: { current: 120 },
    anchor: { current: null as { time: number; x: number } | null },
  };
  const probe = renderHook((props) => useTimelineRangeZoom(props), { initialProps: options });
  const first = probe.result.current;
  probe.rerender({ ...options });
  expect(probe.result.current).toBe(first);
  act(() => probe.result.current(1, 2));
  expect(options.setZoom).toHaveBeenLastCalledWith(608);
  expect(options.anchor.current).toEqual({ time: 1, x: 24 });
  probe.rerender({ ...options, zoom: 640 });
  act(() => probe.result.current(1, 2));
  expect(options.viewport.current.scrollLeft).toBe(616);
  expect(options.saveZoom).toHaveBeenLastCalledWith(640);
});

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
