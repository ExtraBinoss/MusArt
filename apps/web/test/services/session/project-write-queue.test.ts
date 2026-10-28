import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, type Project } from "@musart/core";
import { ProjectWriteQueue } from "../../../src/services/session/project-write-queue";
import { ProjectStore } from "../../../src/services/projects/storage";
import { StaleProjectWriteError } from "../../../src/services/projects/writes/revision";

const stores: ProjectStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}
async function ticks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

it("captures an immutable project synchronously and exposes a stable bound save function", async () => {
  const project = createProject({
      name: "Captured",
      pages: [createPage({ layers: [createLayer("rectangle", { x: 12 })] })],
    }),
    persist = vi.fn(async (_project: Project) => {}),
    queue = new ProjectWriteQueue(persist),
    { save } = queue;
  const pending = save(project);
  project.name = "Later caller edit";
  project.pages[0]!.layers[0]!.x = 99;
  await pending;
  const snapshot = persist.mock.calls[0]![0];
  expect(snapshot.name).toBe("Captured");
  expect(snapshot.pages[0]!.layers[0]!.x).toBe(12);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.pages[0]!.layers[0])).toBe(true);
  expect(Object.isFrozen(project)).toBe(false);
  await queue.dispose();
});

it("runs accepted writes FIFO and resumes after failure without changing each write's rejection", async () => {
  const started: string[] = [],
    firstGate = gate(),
    error = new Error("Write failed"),
    queue = new ProjectWriteQueue(async (project) => {
      started.push(project.name);
      if (project.name === "A") {
        await firstGate.promise;
        throw error;
      }
    }),
    base = createProject();
  const first = queue.save({ ...base, name: "A" }),
    second = queue.save({ ...base, name: "B" }),
    failed = expect(first).rejects.toBe(error);
  await ticks();
  expect(started).toEqual(["A"]);
  expect(queue.flush()).toBe(second);
  firstGate.resolve();
  await failed;
  await second;
  await queue.flush();
  expect(started).toEqual(["A", "B"]);
  await queue.dispose();
});

it("reports the last failed write through flush and disposal while closing admission immediately", async () => {
  const error = new Error("Quota reached"),
    persist = vi.fn(async () => {
      throw error;
    }),
    queue = new ProjectWriteQueue(persist),
    pending = queue.save(createProject()),
    disposal = queue.dispose();
  expect(queue.dispose()).toBe(disposal);
  await expect(queue.save(createProject())).rejects.toThrow("disposed");
  await expect(pending).rejects.toBe(error);
  await expect(queue.flush()).rejects.toBe(error);
  await expect(disposal).rejects.toBe(error);
  expect(persist).toHaveBeenCalledOnce();
});

it("drains every accepted snapshot on disposal without cancelling queued writes", async () => {
  const firstGate = gate(),
    calls: string[] = [],
    queue = new ProjectWriteQueue(async (project) => {
      calls.push(project.name);
      await firstGate.promise;
    }),
    project = createProject(),
    first = queue.save({ ...project, name: "A" }),
    second = queue.save({ ...project, name: "B" }),
    disposal = queue.dispose();
  await ticks();
  expect(calls).toEqual(["A"]);
  await expect(queue.save(project)).rejects.toThrow("disposed");
  firstGate.resolve();
  await Promise.all([first, second, disposal]);
  expect(calls).toEqual(["A", "B"]);
  expect(queue.dispose()).toBe(disposal);
});

it("bounds admission at 128 immutable snapshots and releases slots after completion", async () => {
  const firstGate = gate(),
    persist = vi.fn(async (_project: Project) => {
      await firstGate.promise;
    }),
    queue = new ProjectWriteQueue(persist),
    project = createProject(),
    accepted = Array.from({ length: 128 }, (_, index) =>
      queue.save({ ...project, name: String(index) }),
    );
  await expect(queue.save(project)).rejects.toThrow("full");
  await ticks();
  expect(persist).toHaveBeenCalledOnce();
  firstGate.resolve();
  await Promise.all(accepted);
  await queue.save(project);
  expect(persist).toHaveBeenCalledTimes(129);
  expect(persist.mock.calls.slice(0, 128).map(([saved]) => saved.name)).toEqual(
    Array.from({ length: 128 }, (_, index) => String(index)),
  );
  await queue.dispose();
});

it("rejects uncapturable input without consuming an admission slot or modifying the tail", async () => {
  const persist = vi.fn(async (_project: Project) => {}),
    queue = new ProjectWriteQueue(persist),
    before = queue.flush();
  await expect(queue.save({ ...createProject(), bad: () => {} } as Project)).rejects.toThrow();
  expect(queue.flush()).toBe(before);
  expect(persist).not.toHaveBeenCalled();
  await queue.save(createProject());
  await queue.dispose();
});

it("advances the same store's durable baseline between local writes instead of racing their hashes", async () => {
  const store = new ProjectStore(crypto.randomUUID());
  stores.push(store);
  const project = createProject(),
    firstGate = gate(),
    order: string[] = [];
  await store.save(project);
  const queue = new ProjectWriteQueue(async (snapshot) => {
    order.push(snapshot.name);
    if (snapshot.name === "First") await firstGate.promise;
    await store.saveCurrent(snapshot);
  });
  const first = queue.save({ ...project, name: "First" }),
    second = queue.save({ ...project, name: "Second" });
  await ticks();
  expect(order).toEqual(["First"]);
  firstGate.resolve();
  await Promise.all([first, second]);
  expect((await store.load(project.id)).name).toBe("Second");
  await queue.dispose();
});

it("preserves cross-session CAS rejection and can recover only after an explicit reload", async () => {
  const name = crypto.randomUUID(),
    first = new ProjectStore(name),
    other = new ProjectStore(name);
  stores.push(first, other);
  const project = createProject(),
    firstGate = gate();
  await first.save(project);
  const queue = new ProjectWriteQueue(async (snapshot) => {
    await firstGate.promise;
    await first.saveCurrent(snapshot);
  });
  const pending = queue.save({ ...project, name: "Local stale" });
  await other.save({ ...project, name: "Other session" });
  firstGate.resolve();
  await expect(pending).rejects.toBeInstanceOf(StaleProjectWriteError);
  await expect(queue.flush()).rejects.toBeInstanceOf(StaleProjectWriteError);
  expect((await other.load(project.id)).name).toBe("Other session");
  const reopened = await first.load(project.id);
  await queue.save({ ...reopened, name: "Resolved after reopen" });
  expect((await other.load(project.id)).name).toBe("Resolved after reopen");
  await queue.dispose();
});
