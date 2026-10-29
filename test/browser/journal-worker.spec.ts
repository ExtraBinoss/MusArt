import { expect, test, type Page } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";

declare global {
  interface Window {
    journalFault: {
      mode: "" | "ack" | "drop" | "drop-late";
      created: number;
      live: number;
      crashes: number;
      dropped: number;
      gatedTasks: number;
      gateTimeouts: number;
      pendingGate: boolean;
      remoteErrors: { id: number; message: string; afterFinish: boolean }[];
    };
    journalFaultCleanup: () => void;
  }
}
async function prepare(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const fault: Window["journalFault"] = {
      mode: "",
      created: 0,
      live: 0,
      crashes: 0,
      dropped: 0,
      gatedTasks: 0,
      gateTimeouts: 0,
      pendingGate: false,
      remoteErrors: [],
    };
    window.journalFault = fault;
    type Task = () => unknown;
    type TaskOptions = { priority?: string; signal?: AbortSignal };
    const scheduler = (
      globalThis as typeof globalThis & {
        scheduler?: { postTask: (task: Task, options?: TaskOptions) => Promise<unknown> };
      }
    ).scheduler;
    if (!scheduler) throw Error("This native fault fixture requires scheduler.postTask.");
    const originalPostTask = scheduler.postTask,
      nativePostTask = originalPostTask.bind(scheduler);
    let gate: Promise<void> | null = null,
      release: (() => void) | null = null,
      gateReady = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const gateOwners = new Set<Worker>();
    const releaseGate = () => {
      clearTimeout(timer);
      timer = undefined;
      const resolve = release;
      gate = null;
      release = null;
      gateOwners.clear();
      gateReady = false;
      fault.pendingGate = false;
      resolve?.();
    };
    scheduler.postTask = (task, options) => {
      if (!gate || !gateReady) return nativePostTask(task, options);
      fault.gatedTasks++;
      return gate.then(() => nativePostTask(task, options));
    };
    const cleanup = () => {
      releaseGate();
      scheduler.postTask = originalPostTask;
      window.Worker = NativeWorker;
      window.removeEventListener("pagehide", cleanup);
    };
    window.journalFaultCleanup = cleanup;
    window.addEventListener("pagehide", cleanup, { once: true });
    window.Worker = class extends NativeWorker {
      private readonly journal: boolean;
      private kind = "";
      private closed = false;
      private droppedId = 0;
      private finishedId = 0;
      private held: {
        message: unknown;
        options?: Transferable[] | StructuredSerializeOptions;
      } | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.journal = String(url).includes("journal.worker");
        if (!this.journal) return;
        fault.created++;
        fault.live++;
        this.addEventListener("error", () => {
          if (gateOwners.has(this)) releaseGate();
        });
        this.addEventListener("message", (event: MessageEvent) => {
          if (this.droppedId === event.data?.id && event.data?.error) {
            fault.remoteErrors.push({
              id: event.data.id,
              message: event.data.error.message,
              afterFinish: this.finishedId === event.data.id,
            });
            if (gateOwners.has(this)) releaseGate();
          }
          if (fault.mode !== "ack" || this.kind !== "commit" || !event.data?.result) return;
          fault.mode = "";
          fault.crashes++;
          event.stopImmediatePropagation();
          this.dispatchEvent(
            new ErrorEvent("error", { message: "Injected lost journal ACK", cancelable: true }),
          );
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as { id: number; type?: string; action?: { kind: string } };
        if (this.journal && request.type === "begin") this.kind = request.action!.kind;
        if (
          this.journal &&
          this.kind === "commit" &&
          request.type === "part" &&
          fault.mode === "drop"
        ) {
          fault.mode = "";
          fault.dropped++;
          this.droppedId = request.id;
          gateOwners.add(this);
          fault.pendingGate = true;
          gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          // One following real part reaches the Worker and triggers its own invalid-order
          // rejection. Then pause the producer until that native reply, before finish.
          timer = setTimeout(() => {
            fault.gateTimeouts++;
            releaseGate();
          }, 5000);
          return;
        }
        if (this.journal && this.kind === "commit" && fault.mode === "drop-late") {
          if (request.type === "part") {
            if (this.held) this.sendNative(this.held.message, this.held.options);
            this.held = { message, options };
            return;
          }
          if (request.type === "finish" && this.held) {
            // Drop the final fragment only: the native Worker cannot reject the count
            // mismatch until finish, and its clean post-finish rejection permits reuse.
            this.held = null;
            this.droppedId = request.id;
            fault.mode = "";
            fault.dropped++;
          }
        }
        if (this.journal && request.type === "finish") this.finishedId = request.id;
        this.sendNative(message, options);
        if (gateOwners.has(this) && request.type === "part") gateReady = true;
      }
      private sendNative(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        this.held = null;
        if (gateOwners.has(this)) releaseGate();
        if (this.journal && !this.closed) {
          this.closed = true;
          fault.live--;
        }
        super.terminate();
      }
    };
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.locator('canvas[data-renderer-ready="true"]').waitFor();
  await page.evaluate(() => window.musart!.flush());
}
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.journalFaultCleanup?.());
});
async function header(page: Page) {
  return page.evaluate(async () => {
    const id = window.musart!.snapshot().project.id,
      opening = indexedDB.open("musart-studio", 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction("journalMeta").objectStore("journalMeta").get(id);
      return await new Promise<{ next: number; count: number }>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test("native journal recovers a lost accepted ACK exactly once and owns worker retirement", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page);
  const before = await header(page);
  await page.evaluate(async () => {
    window.journalFault.mode = "ack";
    window.musart!.execute({ type: "renameProject", name: "Lost ACK persisted once" });
    await window.musart!.flush();
  });
  const after = await header(page);
  expect(after.next).toBe(before.next + 1);
  expect(after.count).toBe(before.count + 1);
  const state = await page.evaluate(async () => ({
    history: await window.musart!.historyInfo(),
    fault: window.journalFault,
    reads: window.__musartVideoReadbacks,
  }));
  expect(state.history.error).toBe(false);
  expect(state.fault).toMatchObject({ created: 2, live: 1, crashes: 1 });
  expect(state.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  expect(errors).toEqual([]);
});

test("native journal rejects missing metadata fragments atomically and checkpoints the next real commit", async ({
  page,
}) => {
  await prepare(page);
  const before = await header(page);
  const failure = await page.evaluate(async () => {
    window.journalFault.mode = "drop";
    window.musart!.execute({ type: "renameProject", name: "Rejected fragmented capture" });
    try {
      await window.musart!.flush();
      return "unexpected success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(failure).toContain("fragment");
  expect(await header(page)).toEqual(before);
  await page.evaluate(async () => {
    window.musart!.execute({ type: "renameProject", name: "Recovered complete capture" });
    await window.musart!.flush();
  });
  const pageInfo = await page.evaluate(() => window.musart!.historyPage());
  expect(pageInfo.total).toBe(before.count + 1);
  expect(pageInfo.entries.at(-1)!.event.after!.name).toBe("Recovered complete capture");
  expect(await page.evaluate(() => window.journalFault)).toMatchObject({
    created: 2,
    live: 1,
    dropped: 1,
    pendingGate: false,
    gateTimeouts: 0,
    remoteErrors: [{ message: "Invalid fragment order.", afterFinish: false }],
  });
  expect(await page.evaluate(() => window.journalFault.gatedTasks)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("native journal rejects a final missing fragment after finish atomically and reuses the clean worker", async ({
  page,
}) => {
  await prepare(page);
  const before = await header(page);
  const failure = await page.evaluate(async () => {
    window.journalFault.mode = "drop-late";
    window.musart!.execute({ type: "renameProject", name: "Rejected final fragment" });
    try {
      await window.musart!.flush();
      return "unexpected success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(failure).toContain("fragment");
  expect(await header(page)).toEqual(before);
  await page.evaluate(async () => {
    window.musart!.execute({ type: "renameProject", name: "Recovered after clean rejection" });
    await window.musart!.flush();
  });
  const pageInfo = await page.evaluate(() => window.musart!.historyPage());
  expect(pageInfo.total).toBe(before.count + 1);
  expect(pageInfo.entries.at(-1)!.event.after!.name).toBe("Recovered after clean rejection");
  expect(await page.evaluate(() => window.journalFault)).toMatchObject({
    created: 1,
    live: 1,
    dropped: 1,
    gatedTasks: 0,
    gateTimeouts: 0,
    pendingGate: false,
    remoteErrors: [{ message: "Journal fragment count does not match.", afterFinish: true }],
  });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
