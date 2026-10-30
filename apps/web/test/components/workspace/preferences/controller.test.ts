import { afterEach, expect, test, vi } from "vitest";
import { createProjectPreferencesController } from "../../../../src/components/workspace/preferences/controller";
import type { ProjectLayoutPreferences } from "../../../../src/services/projects/preferences/model";

afterEach(() => vi.useRealTimers());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("hydrates only untouched fields, with one lazy read and field-local notifications", async () => {
  const reading = deferred<ProjectLayoutPreferences>();
  const port = { read: vi.fn(() => reading.promise), update: vi.fn().mockResolvedValue(undefined) };
  const error = vi.fn(),
    zoom = vi.fn(),
    height = vi.fn();
  const controller = createProjectPreferencesController("project-a", port, error);
  expect(port.read).not.toHaveBeenCalled();
  const stopZoom = controller.subscribe("timelineZoom", zoom);
  const stopHeight = controller.subscribe("timelineHeight", height);
  controller.protect("timelineZoom");
  reading.resolve({ timelineZoom: 320, timelineHeight: 0.4 });
  await reading.promise;
  await Promise.resolve();
  expect(port.read).toHaveBeenCalledTimes(1);
  expect(controller.read("timelineZoom")).toBeUndefined();
  expect(controller.read("timelineHeight")).toBe(0.4);
  expect(zoom).not.toHaveBeenCalled();
  expect(height).toHaveBeenCalledOnce();
  expect(port.update).not.toHaveBeenCalled();
  stopZoom();
  stopHeight();
});

test("previews are memory-only, commits serialize and wheel writes debounce with final cleanup", async () => {
  vi.useFakeTimers();
  const port = {
    read: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const controller = createProjectPreferencesController("project-a", port, vi.fn());
  const stop = controller.subscribe("timelineZoom", vi.fn());
  controller.preview("timelineZoom", 200);
  await vi.advanceTimersByTimeAsync(1000);
  expect(port.update).not.toHaveBeenCalled();
  controller.commit("timelineZoom", 240, 600);
  await vi.advanceTimersByTimeAsync(400);
  controller.commit("timelineZoom", 260, 600);
  await vi.advanceTimersByTimeAsync(599);
  expect(port.update).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(port.update).toHaveBeenCalledExactlyOnceWith("project-a", { timelineZoom: 260 });
  controller.commit("timelineZoom", 300, 600);
  stop();
  await controller.flush();
  expect(port.update).toHaveBeenLastCalledWith("project-a", { timelineZoom: 300 });
  expect(vi.getTimerCount()).toBe(0);
});

test("project replacement and unsubscription reject late reads without crossing project IDs", async () => {
  const old = deferred<ProjectLayoutPreferences>();
  const port = {
    read: vi.fn((id: string) =>
      id === "old" ? old.promise : Promise.resolve({ timelineZoom: 360 }),
    ),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const first = createProjectPreferencesController("old", port, vi.fn());
  const oldNotify = vi.fn(),
    stop = first.subscribe("timelineZoom", oldNotify);
  stop();
  const next = createProjectPreferencesController("new", port, vi.fn());
  const finish = next.subscribe("timelineZoom", vi.fn());
  old.resolve({ timelineZoom: 90 });
  await old.promise;
  await Promise.resolve();
  expect(first.read("timelineZoom")).toBeUndefined();
  expect(oldNotify).not.toHaveBeenCalled();
  expect(next.read("timelineZoom")).toBe(360);
  next.commit("timelineZoom", 400);
  await next.flush();
  expect(port.update).toHaveBeenCalledExactlyOnceWith("new", { timelineZoom: 400 });
  finish();
});

test("storage failures retain the current session value and report the original error", async () => {
  const failure = new Error("quota");
  const error = vi.fn();
  const controller = createProjectPreferencesController(
    "project-a",
    {
      read: () => Promise.reject(failure),
      update: () => Promise.reject(failure),
    },
    error,
  );
  const stop = controller.subscribe("timelineZoom", vi.fn());
  await Promise.resolve();
  await Promise.resolve();
  controller.commit("timelineZoom", 420);
  await controller.flush();
  expect(controller.read("timelineZoom")).toBe(420);
  expect(error).toHaveBeenCalledWith(failure);
  stop();
});
