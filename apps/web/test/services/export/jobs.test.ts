import { expect, test, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { ExportJobs, getExportJobs, hasActiveExports } from "../../../src/services/export/jobs";
import {
  answerExportLeave,
  confirmExportLeave,
  exportLeaveRequested,
} from "../../../src/services/export/leave";

const job = { kind: "motion" as const, projectId: "project", name: "Artwork" };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("one background export survives subscribers, reports real work, and completes only after finalization", async () => {
  const jobs = new ExportJobs(),
    finalizing = deferred(),
    listener = vi.fn();
  const stop = jobs.subscribe(listener);
  expect(
    jobs.start(job, async ({ progress }) => {
      progress(0.4);
      progress(0.1);
      progress(NaN);
      progress(1);
      await finalizing.promise;
    }),
  ).toBe(true);
  expect(jobs.read()).toMatchObject({ status: "running", percent: 99 });
  expect(jobs.start(job, async () => {})).toBe(false);
  stop();
  const count = listener.mock.calls.length;
  finalizing.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(jobs.read()).toMatchObject({ status: "complete", percent: 100 });
  expect(listener).toHaveBeenCalledTimes(count);
  expect(hasActiveExports()).toBe(false);
});
test("cancellation stays pending through encoder cleanup, rejects duplicate work and never reports success", async () => {
  const jobs = new ExportJobs(),
    cleanup = deferred();
  let signal!: AbortSignal;
  jobs.start(job, async (work) => {
    signal = work.signal;
    await cleanup.promise;
  });
  jobs.cancel();
  jobs.cancel();
  expect(signal.aborted).toBe(true);
  expect(jobs.read()).toMatchObject({ status: "cancelling", percent: 0 });
  expect(jobs.pending).toBe(true);
  expect(jobs.start(job, async () => {})).toBe(false);
  const drained = jobs.stop();
  cleanup.resolve();
  await drained;
  expect(jobs.read()).toMatchObject({ status: "cancelled" });
  expect(hasActiveExports()).toBe(false);
});
test("real failures remain available after the dialog closes and a retry starts a new operation", async () => {
  const jobs = new ExportJobs(),
    error = new Error("Encoder unavailable");
  jobs.start(job, async () => {
    throw error;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(jobs.read()).toMatchObject({ status: "failed", error });
  expect(jobs.start(job, async () => {})).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(jobs.read()).toMatchObject({ status: "complete" });
});
test("leaving asks once, staying retains the export, leaving waits for cancellation cleanup", async () => {
  const jobs = new ExportJobs(),
    cleanup = deferred();
  jobs.start(job, async () => {
    await cleanup.promise;
  });
  const stay = confirmExportLeave(),
    same = confirmExportLeave();
  expect(exportLeaveRequested()).toBe(true);
  answerExportLeave(false);
  expect(await stay).toBe(false);
  expect(await same).toBe(false);
  expect(jobs.pending).toBe(true);
  const leave = confirmExportLeave();
  answerExportLeave(true);
  await Promise.resolve();
  expect(jobs.read()?.status).toBe("cancelling");
  cleanup.resolve();
  expect(await leave).toBe(true);
  expect(await confirmExportLeave()).toBe(true);
});
test("project reload cancels an export even with the same durable ID; ordinary edits and selection remain usable", async () => {
  const engine = new EditorEngine(createProject()),
    jobs = getExportJobs(engine),
    cleanup = deferred();
  let signal!: AbortSignal;
  jobs.start({ ...job, projectId: engine.getSnapshot().project.id }, async (work) => {
    signal = work.signal;
    await cleanup.promise;
  });
  engine.execute({ type: "renameProject", name: "Keep editing" });
  engine.select([]);
  expect(signal.aborted).toBe(false);
  engine.load(engine.getSnapshot().project);
  expect(signal.aborted).toBe(true);
  cleanup.resolve();
  await jobs.stop();
  expect(getExportJobs(engine)).toBe(jobs);
});

test("late progress from a failed encoder cannot corrupt a new export", async () => {
  const jobs = new ExportJobs(),
    hold = deferred();
  let previous!: (fraction: number) => void;
  jobs.start(job, async ({ progress }) => {
    previous = progress;
    throw new Error("Failure");
  });
  await Promise.resolve();
  await Promise.resolve();
  jobs.start(job, async () => {
    await hold.promise;
  });
  previous(0.8);
  expect(jobs.read()?.percent).toBe(0);
  hold.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
