import { afterEach, expect, test, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});
function consoleSpies() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    group: vi.spyOn(console, "groupCollapsed").mockImplementation(() => {}),
    table: vi.spyOn(console, "table").mockImplementation(() => {}),
    end: vi.spyOn(console, "groupEnd").mockImplementation(() => {}),
  };
}
test("development logs stage milliseconds and waits for the correct visible project frame", async () => {
  vi.stubEnv("DEV", true);
  vi.resetModules();
  const log = consoleSpies();
  let clock = 100;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const { beginProjectTiming, reportProjectPresentation } =
    await import("../../../src/services/performance/project-timing");
  const timing = beginProjectTiming("Open project")!;
  clock = 150;
  timing.stage("Read");
  clock = 250;
  const snapshot = new EditorEngine(createProject()).getSnapshot();
  timing.waitForFrame(snapshot);
  expect(timing.waitingForFrame).toBe(true);
  reportProjectPresentation({ projectId: "other", revision: snapshot.revision }, snapshot.pageId);
  expect(log.group).not.toHaveBeenCalled();
  clock = 400;
  reportProjectPresentation(
    { projectId: snapshot.project.id, revision: snapshot.revision },
    snapshot.pageId,
  );
  expect(log.group).toHaveBeenCalledWith(expect.stringContaining("300 ms (ready)"));
  expect(log.table).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ stage: "First visible canvas frame", ms: 150 }),
    ]),
  );
  timing.finish("failed");
  expect(log.group).toHaveBeenCalledOnce();
});
test("production does not log, read clocks or retain presentation waits", async () => {
  vi.stubEnv("DEV", false);
  vi.resetModules();
  const log = consoleSpies();
  const now = vi.spyOn(performance, "now");
  const { beginProjectTiming, reportProjectPresentation } =
    await import("../../../src/services/performance/project-timing");
  expect(beginProjectTiming("Open project")).toBeUndefined();
  reportProjectPresentation({ projectId: "p", revision: 1 }, "page");
  expect(now).not.toHaveBeenCalled();
  expect(log.info).not.toHaveBeenCalled();
  expect(log.group).not.toHaveBeenCalled();
});
test("superseded navigation and real render failures close each development trace once", async () => {
  vi.stubEnv("DEV", true);
  vi.resetModules();
  const log = consoleSpies();
  const { beginProjectTiming, reportProjectRenderFailure } =
    await import("../../../src/services/performance/project-timing");
  const snapshot = new EditorEngine(createProject()).getSnapshot();
  beginProjectTiming("First")!.waitForFrame(snapshot);
  const next = beginProjectTiming("Second")!;
  next.waitForFrame(snapshot);
  expect(log.group).toHaveBeenCalledWith(expect.stringContaining("superseded"));
  reportProjectRenderFailure(
    { projectId: snapshot.project.id, revision: snapshot.revision },
    snapshot.pageId,
    Error("GPU failed"),
  );
  expect(log.group).toHaveBeenCalledTimes(2);
  expect(log.info).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", error: "GPU failed" }),
  );
});
