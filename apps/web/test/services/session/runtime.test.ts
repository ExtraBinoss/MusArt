import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@musart/core";
import { createRuntime } from "../../../src/services/session/runtime";
import { ProjectStore } from "../../../src/services/projects/storage";
import { SelectionClient, type WorkerPort } from "../../../src/services/selection/selection";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { ThumbnailPipeline } from "../../../src/services/projects/thumbnails";
import { ThumbnailRenderer } from "../../../src/services/projects/thumbnails/renderer";
import { getAnimationSession } from "../../../src/services/animation/session";
import { evaluateReplay } from "@musart/core";
function selection() {
  const port: WorkerPort = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  const client = new SelectionClient(() => port);
  return client;
}
function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: [], getData: () => text } });
  document.dispatchEvent(event);
  return event;
}
afterEach(() => {
  vi.useRealTimers();
  history.replaceState(null, "", "/");
});
it("requeues thumbnails after a successful current canonical save and ignores a superseded save", async () => {
  const store = new ProjectStore(crypto.randomUUID()),
    renderer = new ThumbnailRenderer(async () => {
      throw Error("Unexpected GPU");
    }),
    thumbnails = new ThumbnailPipeline(store, { renderer }),
    schedule = vi.spyOn(thumbnails, "schedule"),
    runtime = await createRuntime(vi.fn(), {
      store,
      thumbnails,
      project: createProject(),
      selection: selection(),
      autosaveDelay: 10000,
    });
  try {
    runtime.engine.execute({ type: "renameProject", name: "Saved current" });
    schedule.mockClear();
    await runtime.flush();
    expect(schedule).toHaveBeenCalledExactlyOnceWith(runtime.engine.getSnapshot().project);
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        started = resolve;
      });
    vi.spyOn(store, "saveCurrent").mockImplementationOnce(async () => {
      started();
      await gate;
    });
    runtime.engine.execute({ type: "renameProject", name: "First awaiting save" });
    const pending = runtime.flush();
    await ready;
    runtime.engine.execute({ type: "renameProject", name: "New canonical" });
    schedule.mockClear();
    release();
    await pending;
    expect(schedule).not.toHaveBeenCalled();
    await runtime.flush();
    expect(schedule).toHaveBeenCalledExactlyOnceWith(runtime.engine.getSnapshot().project);
  } finally {
    await runtime.dispose();
  }
});
it("a save completing during disposal cannot restart disposed thumbnail work", async () => {
  const store = new ProjectStore(crypto.randomUUID()),
    renderer = new ThumbnailRenderer(async () => {
      throw Error("Unexpected GPU");
    }),
    thumbnails = new ThumbnailPipeline(store, { renderer }),
    schedule = vi.spyOn(thumbnails, "schedule"),
    runtime = await createRuntime(vi.fn(), {
      store,
      thumbnails,
      project: createProject(),
      selection: selection(),
      autosaveDelay: 10000,
    });
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  vi.spyOn(store, "saveCurrent").mockImplementationOnce(async () => {
    started();
    await gate;
  });
  runtime.engine.execute({ type: "renameProject", name: "Pending at close" });
  const pending = runtime.flush();
  await ready;
  const closing = runtime.dispose();
  schedule.mockClear();
  release();
  await Promise.all([pending, closing]);
  expect(schedule).not.toHaveBeenCalled();
});
describe("editor platform lifecycle", () => {
  it("restores the last local project and flushes document changes on pagehide and disposal", async () => {
    const store = new ProjectStore(crypto.randomUUID());
    const project = createProject({ name: "Recovered" });
    await store.save(project);
    const save = vi.spyOn(store, "save"),
      guardedSave = vi.spyOn(store, "saveCurrent");
    const client = selection();
    const dispose = vi.spyOn(client, "dispose");
    const close = vi.spyOn(store, "close");
    const onError = vi.fn();
    const runtime = await createRuntime(onError, {
      store,
      selection: client,
      autosaveDelay: 10000,
    });
    expect(runtime.engine.getSnapshot().project.name).toBe("Recovered");
    expect(save).not.toHaveBeenCalled();
    expect(guardedSave).not.toHaveBeenCalled();
    expect(paste("Pasted title").defaultPrevented).toBe(true);
    expect(runtime.engine.getSnapshot().project.pages[0]!.layers[0]?.text).toBe("Pasted title");
    runtime.engine.execute({ type: "renameProject", name: "Before navigation" });
    window.dispatchEvent(new Event("pagehide"));
    await runtime.flush();
    expect((await store.load(project.id)).name).toBe("Before navigation");
    await runtime.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    const before = runtime.engine.getSnapshot();
    paste("After dispose");
    expect(runtime.engine.getSnapshot()).toBe(before);
  });
  it("honors an explicit initial project without querying the previous session", async () => {
    const store = new ProjectStore(crypto.randomUUID());
    const last = vi.spyOn(store, "last");
    const project = createProject({ name: "Explicit" });
    const runtime = await createRuntime(vi.fn(), { store, project });
    expect(last).not.toHaveBeenCalled();
    expect(runtime.engine.getSnapshot().project.name).toBe("Explicit");
    await runtime.dispose();
  });
  it("recovers from unavailable storage, surfaces failures and still provides an editable session", async () => {
    history.replaceState(null, "", "/?automation=1");
    const store = new ProjectStore(crypto.randomUUID());
    vi.spyOn(store, "last").mockRejectedValueOnce(new Error("Storage blocked"));
    vi.spyOn(store, "save").mockRejectedValueOnce(new Error("Quota reached"));
    const onError = vi.fn();
    const runtime = await createRuntime(onError, { store });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(runtime.engine.getSnapshot().project.pages).toHaveLength(2);
    runtime.engine.execute({ type: "renameProject", name: "Still editable" });
    await runtime.dispose();
  });
  it("keeps the deterministic demo available only for explicitly seeded automation sessions", async () => {
    history.replaceState(null, "", "/?automation=1");
    const runtime = await createRuntime(vi.fn(), { store: new ProjectStore(crypto.randomUUID()) });
    expect(runtime.welcome).toBe(false);
    expect(runtime.engine.getSnapshot().project.name).toContain("Explorations");
    await runtime.dispose();
  });
});

it("loads the optional local benchmark and reports missing fixtures without blocking the editor", async () => {
  const fixture = await import("../../../src/services/projects/performance-project");
  const build = vi
    .spyOn(fixture, "createPerformanceProject")
    .mockResolvedValueOnce(createProject({ name: "50 images" }));
  history.replaceState(null, "", "/?benchmark=50");
  const store = new ProjectStore(crypto.randomUUID());
  const runtime = await createRuntime(vi.fn(), { store });
  expect(build).toHaveBeenCalledWith(50);
  expect(runtime.engine.getSnapshot().project.name).toBe("50 images");
  await runtime.dispose();
  build.mockRejectedValueOnce(new Error("Local fixture missing"));
  const onError = vi.fn();
  const fallback = await createRuntime(onError, { store: new ProjectStore(crypto.randomUUID()) });
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Local fixture missing" }),
  );
  expect(fallback.engine.getSnapshot().project.pages).toHaveLength(2);
  await fallback.dispose();
});
it("owns thumbnail scheduling independently from document startup, ignores selection previews and flushes/disposes explicitly", async () => {
  const { ThumbnailPipeline } = await import("../../../src/services/projects/thumbnails");
  const { ThumbnailRenderer } = await import("../../../src/services/projects/thumbnails/renderer");
  const store = new ProjectStore(crypto.randomUUID()),
    project = createProject(),
    renderer = new ThumbnailRenderer(async () => {
      throw new Error("Unexpected GPU");
    });
  const render = vi.spyOn(renderer, "render").mockResolvedValue({
      blob: new Blob(["webp"], { type: "image/webp" }),
      width: 64,
      height: 64,
    }),
    thumbnails = new ThumbnailPipeline(store, { renderer }),
    schedule = vi.spyOn(thumbnails, "schedule"),
    dispose = vi.spyOn(thumbnails, "dispose");
  const runtime = await createRuntime(vi.fn(), {
    store,
    project,
    selection: selection(),
    thumbnails,
  });
  expect(render).not.toHaveBeenCalled();
  expect(schedule).toHaveBeenCalledOnce();
  runtime.engine.select([]);
  expect(schedule).toHaveBeenCalledOnce();
  await runtime.flushThumbnails();
  expect(render).toHaveBeenCalledOnce();
  expect(await store.thumbnailInfo(project.id)).toHaveLength(1);
  await runtime.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
it("gives a newly created demo a persistent UUID while keeping restored project identities intact", async () => {
  history.replaceState(null, "", "/?automation=1");
  const id = "00000000-0000-4000-8000-000000000099";
  const store = new ProjectStore(crypto.randomUUID());
  const uuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
  const runtime = await createRuntime(vi.fn(), { store, selection: selection() });
  expect(runtime.engine.getSnapshot().project.id).toBe(id);
  expect(uuid).toHaveBeenCalled();
  await runtime.dispose();
});
it("aborts StrictMode cold starts before the first write, closes storage, and never creates thumbnail resources", async () => {
  for (const explicit of [false, true]) {
    const store = new ProjectStore(crypto.randomUUID()),
      save = vi.spyOn(store, "save"),
      close = vi.spyOn(store, "close"),
      controller = new AbortController();
    const pending = createRuntime(vi.fn(), {
      store,
      ...(explicit ? { project: createProject() } : {}),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(save).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  }
  const store = new ProjectStore(crypto.randomUUID()),
    controller = new AbortController();
  let finish!: (id: undefined) => void;
  vi.spyOn(store, "last").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const save = vi.spyOn(store, "save"),
    pending = createRuntime(vi.fn(), { store, signal: controller.signal });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  controller.abort();
  finish(undefined);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(save).not.toHaveBeenCalled();
});

function welcomeResources() {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    renderer = new ThumbnailRenderer(async () => {
      throw new Error("Unexpected GPU work");
    }),
    thumbnails = new ThumbnailPipeline(store, { renderer }),
    schedule = vi.spyOn(thumbnails, "schedule"),
    save = vi.spyOn(store, "save"),
    ensure = vi.spyOn(store.history, "ensure");
  return { name, store, thumbnails, schedule, save, ensure };
}

it("opens an empty welcome draft without any manifest, originals, journal, thumbnail or draft clipboard edits", async () => {
  const d = welcomeResources(),
    runtime = await createRuntime(vi.fn(), d);
  const draft = runtime.engine.getSnapshot().project;
  expect(runtime.welcome).toBe(true);
  expect(draft.pages).toHaveLength(1);
  expect(draft.pages[0]!.layers).toEqual([]);
  expect(draft.assets).toEqual({});
  expect(paste("Do not edit the welcome draft").defaultPrevented).toBe(false);
  expect(runtime.engine.getSnapshot().project).toBe(draft);
  runtime.engine.execute({ type: "renameProject", name: "Memory only" });
  window.dispatchEvent(new Event("pagehide"));
  await runtime.flush();
  await runtime.flushThumbnails();
  expect(d.save).not.toHaveBeenCalled();
  expect(d.ensure).not.toHaveBeenCalled();
  expect(d.schedule).not.toHaveBeenCalled();
  const db = await openStudioDatabase(d.name);
  try {
    for (const table of db.objectStoreNames) expect(await db.count(table)).toBe(0);
  } finally {
    db.close();
    await runtime.dispose();
  }
  await runtime.dispose();
  runtime.engine.load(createProject());
  await runtime.flush();
  expect(d.ensure).not.toHaveBeenCalled();
  expect(d.schedule).not.toHaveBeenCalled();
});

it("activates persistence synchronously on the first real create and records the immediate next edit", async () => {
  const d = welcomeResources(),
    runtime = await createRuntime(vi.fn(), { ...d, autosaveDelay: 10000 });
  const draftId = runtime.engine.getSnapshot().project.id;
  await runtime.services.createProject({
    name: "Chosen poster",
    width: 640,
    height: 960,
    background: "#ffffff",
  });
  const chosenId = runtime.engine.getSnapshot().project.id;
  runtime.engine.execute({ type: "updatePage", patch: { background: "#112233" } });
  await runtime.flush();
  expect(chosenId).not.toBe(draftId);
  expect((await d.store.load(chosenId)).pages[0]!.background).toBe("#112233");
  expect(d.ensure).toHaveBeenCalled();
  expect(d.schedule).toHaveBeenCalled();
  expect(d.schedule.mock.calls.every(([project]) => project.id !== draftId)).toBe(true);
  const replay = await d.store.history.replay(chosenId);
  expect(evaluateReplay(replay, replay.duration).pages[0]!.background).toBe("#112233");
  expect(await d.store.history.info(draftId)).toBeUndefined();
  await expect(d.store.load(draftId)).rejects.toThrow("introuvable");
  expect(paste("Editable after choosing").defaultPrevented).toBe(true);
  await runtime.dispose();
  const before = runtime.engine.getSnapshot();
  paste("No listener after close");
  expect(runtime.engine.getSnapshot()).toBe(before);
});

it("opens an existing library project without a last-project preference and then journals/autosaves normally", async () => {
  const d = welcomeResources(),
    chosen = createProject({ name: "From library" });
  await d.store.save(chosen, undefined, { remember: false });
  d.save.mockClear();
  const runtime = await createRuntime(vi.fn(), { ...d, autosaveDelay: 10000 });
  expect(runtime.welcome).toBe(true);
  expect(d.save).not.toHaveBeenCalled();
  await runtime.services.openProject(chosen.id);
  runtime.engine.execute({ type: "renameProject", name: "Opened and edited" });
  await runtime.flush();
  expect((await d.store.load(chosen.id)).name).toBe("Opened and edited");
  expect((await getAnimationSession(runtime.engine).page()).entries.length).toBeGreaterThan(0);
  expect(await d.store.last()).toBe(chosen.id);
  await runtime.dispose();
});

it("keeps a failed create in welcome without enabling draft persistence or reporting false success", async () => {
  const d = welcomeResources(),
    runtime = await createRuntime(vi.fn(), d),
    original = runtime.engine.getSnapshot();
  d.save.mockRejectedValueOnce(new Error("Quota reached"));
  await expect(
    runtime.services.createProject({
      name: "Cannot save",
      width: 100,
      height: 100,
      background: "#ffffff",
    }),
  ).rejects.toThrow("Quota reached");
  expect(runtime.engine.getSnapshot()).toBe(original);
  expect(d.ensure).not.toHaveBeenCalled();
  expect(d.schedule).not.toHaveBeenCalled();
  await runtime.dispose();
  expect(await d.store.list()).toEqual([]);
  await d.store.close();
});

it("reports a missing previous project and returns to welcome without creating a fallback record", async () => {
  const d = welcomeResources(),
    onError = vi.fn();
  vi.spyOn(d.store, "last").mockResolvedValueOnce("missing-project");
  const runtime = await createRuntime(onError, d);
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "Projet local introuvable." }),
  );
  expect(runtime.welcome).toBe(true);
  expect(d.save).not.toHaveBeenCalled();
  expect(d.ensure).not.toHaveBeenCalled();
  await runtime.dispose();
});

it("returns to welcome on unavailable startup storage and reports the actual failure once", async () => {
  const d = welcomeResources(),
    onError = vi.fn();
  vi.spyOn(d.store, "last").mockRejectedValueOnce(new Error("Storage denied"));
  const runtime = await createRuntime(onError, d);
  expect(runtime.welcome).toBe(true);
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "Storage denied" }),
  );
  expect(d.save).not.toHaveBeenCalled();
  expect(d.ensure).not.toHaveBeenCalled();
  expect(d.schedule).not.toHaveBeenCalled();
  await runtime.dispose();
});

it("cancels the StrictMode first startup then reopens welcome without orphan records or deferred observers", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    controller = new AbortController();
  let release!: () => void, started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.spyOn(store, "last").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
        started();
      }),
  );
  const pending = createRuntime(vi.fn(), { store, signal: controller.signal }),
    ensure = vi.spyOn(store.history, "ensure"),
    save = vi.spyOn(store, "save");
  await reading;
  controller.abort();
  release();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const runtime = await createRuntime(vi.fn(), { store });
  expect(runtime.welcome).toBe(true);
  await runtime.dispose();
  runtime.engine.load(createProject());
  expect(ensure).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  const db = await openStudioDatabase(name);
  try {
    for (const table of db.objectStoreNames) expect(await db.count(table)).toBe(0);
  } finally {
    db.close();
  }
});

it("detaches welcome observers and closes storage even when GPU cleanup rejects", async () => {
  const d = welcomeResources(),
    runtime = await createRuntime(vi.fn(), d),
    close = vi.spyOn(d.store, "close"),
    nativeDispose = d.thumbnails.dispose.bind(d.thumbnails);
  const cleanup = vi.spyOn(d.thumbnails, "dispose").mockImplementationOnce(async () => {
    await nativeDispose();
    throw new Error("GPU cleanup failed");
  });
  const closing = runtime.dispose();
  await expect(closing).rejects.toThrow("Runtime cleanup failed");
  expect(runtime.dispose()).toBe(closing);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  runtime.engine.load(createProject());
  expect(d.ensure).not.toHaveBeenCalled();
  expect(d.save).not.toHaveBeenCalled();
});

it.each(["0", "true", ""])(
  "keeps welcome enabled unless automation is explicitly1 (%s)",
  async (value) => {
    history.replaceState(null, "", `/?automation=${value}`);
    const d = welcomeResources(),
      runtime = await createRuntime(vi.fn(), d);
    expect(runtime.welcome).toBe(true);
    expect(d.save).not.toHaveBeenCalled();
    await runtime.dispose();
  },
);
it("runtime autosave rejects another session's newer project instead of replacing it", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    other = new ProjectStore(name),
    project = createProject({ name: "Initial" });
  await store.save(project);
  const onError = vi.fn(),
    runtime = await createRuntime(onError, { store, selection: selection(), autosaveDelay: 10000 });
  try {
    await other.save({ ...project, name: "Other session wins" });
    runtime.engine.execute({ type: "renameProject", name: "Old session edit" });
    await expect(runtime.flush()).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "STALE_PROJECT_WRITE" }));
    expect((await other.load(project.id)).name).toBe("Other session wins");
    onError.mockClear();
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: "STALE_PROJECT_WRITE" }),
      ),
    );
  } finally {
    await expect(runtime.dispose()).rejects.toThrow("Runtime cleanup failed");
    await other.close();
  }
});

it("retries a failed autosave explicitly without requiring another document edit", async () => {
  const store = new ProjectStore(crypto.randomUUID()),
    project = createProject({ name: "Initial" });
  await store.save(project);
  const onError = vi.fn(),
    runtime = await createRuntime(onError, { store, selection: selection(), autosaveDelay: 10000 });
  try {
    vi.spyOn(store, "saveCurrent").mockRejectedValueOnce(new Error("Temporary quota failure"));
    runtime.engine.execute({ type: "renameProject", name: "Retry this state" });
    await expect(runtime.flush()).rejects.toThrow("Temporary quota failure");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Temporary quota failure" }),
    );
    await runtime.services.saveProject();
    expect((await store.load(project.id)).name).toBe("Retry this state");
    await expect(runtime.flush()).resolves.toBeUndefined();
  } finally {
    await runtime.dispose();
  }
});
