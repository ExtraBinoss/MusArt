import { expect, test, type Page } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";

declare global {
  interface Window {
    journalFault: {
      mode: "" | "ack" | "drop";
      created: number;
      live: number;
      crashes: number;
      dropped: number;
    };
  }
}
async function prepare(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const fault: Window["journalFault"] = { mode: "", created: 0, live: 0, crashes: 0, dropped: 0 };
    window.journalFault = fault;
    window.Worker = class extends NativeWorker {
      private readonly journal: boolean;
      private kind = "";
      private closed = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.journal = String(url).includes("journal.worker");
        if (!this.journal) return;
        fault.created++;
        fault.live++;
        this.addEventListener("message", (event: MessageEvent) => {
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
        const request = message as { type?: string; action?: { kind: string } };
        if (this.journal && request.type === "begin") this.kind = request.action!.kind;
        if (
          this.journal &&
          this.kind === "commit" &&
          request.type === "part" &&
          fault.mode === "drop"
        ) {
          fault.mode = "";
          fault.dropped++;
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
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
  });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
