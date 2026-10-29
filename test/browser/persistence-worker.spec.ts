import { expect, test, type Page } from "@playwright/test";
import type { StoredProject } from "../../apps/web/src/services/projects/database";
import { installReadbackProbe } from "./support/readback-probe";

interface SaveReply {
  id: number;
  bytes: number;
  keys: string[];
  resultKeys: string[];
  valueKeys: string[];
  projectId: string;
  assetsRevision: string;
  writeRevision: string;
}
declare global {
  interface Window {
    persistenceFault: {
      mode: "" | "ack" | "drop";
      created: number;
      live: number;
      terminated: number;
      crashes: number;
      dropped: number;
      begins: number;
      finishes: number;
      replies: SaveReply[];
    };
  }
}

async function prepare(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const fault: Window["persistenceFault"] = {
      mode: "",
      created: 0,
      live: 0,
      terminated: 0,
      crashes: 0,
      dropped: 0,
      begins: 0,
      finishes: 0,
      replies: [],
    };
    window.persistenceFault = fault;
    window.Worker = class extends NativeWorker {
      private readonly persistence: boolean;
      private closed = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.persistence = String(url).includes("persistence.worker");
        if (!this.persistence) return;
        fault.created++;
        fault.live++;
        this.addEventListener("message", (event: MessageEvent) => {
          const packet = event.data;
          if (packet?.result?.kind !== "save") return;
          const value = packet.result.value;
          fault.replies.push({
            id: packet.id,
            bytes: new TextEncoder().encode(JSON.stringify(packet)).byteLength,
            keys: Object.keys(packet).sort(),
            resultKeys: Object.keys(packet.result).sort(),
            valueKeys: Object.keys(value).sort(),
            projectId: value.projectId,
            assetsRevision: value.assetsRevision,
            writeRevision: value.writeRevision,
          });
          if (fault.mode !== "ack") return;
          fault.mode = "";
          fault.crashes++;
          event.stopImmediatePropagation();
          this.dispatchEvent(
            new ErrorEvent("error", {
              message: "Injected lost persistence ACK",
              cancelable: true,
            }),
          );
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as { type?: string };
        if (this.persistence) {
          if (request.type === "begin") fault.begins++;
          if (request.type === "finish") fault.finishes++;
          if (request.type === "part" && fault.mode === "drop") {
            fault.mode = "";
            fault.dropped++;
            return;
          }
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        if (this.persistence && !this.closed) {
          this.closed = true;
          fault.live--;
          fault.terminated++;
        }
        super.terminate();
      }
    };
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.locator('canvas[data-renderer-ready="true"]').waitFor();
  // Drain autosave, the journal and thumbnail persistence before injecting a manual-save fault.
  await page.evaluate(() => window.musart!.flushThumbnails());
  await stored(page, "before-setup");
  // The first published save can legitimately add exact optional page-byte caches that the
  // bootstrap's external snapshot did not retain. Establish that real saved baseline first;
  // the fault window still compares every manifest field and counts exactly one later write.
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  await stored(page, "after-setup");
  expect(await page.evaluate(() => window.persistenceFault.created)).toBeGreaterThan(0);
}

async function stored(page: Page, label: string) {
  const capture = await page.evaluate(async () => {
    const id = window.musart!.snapshot().project.id,
      opening = indexedDB.open("musart-studio", 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const tx = db.transaction(["projects", "preferences", "assets", "journalMeta"]),
        record = tx.objectStore("projects").get(id),
        revision = tx.objectStore("preferences").get(JSON.stringify(["musart:project-write", id])),
        assets = tx.objectStore("assets").index("by-project").count(id),
        journal = tx.objectStore("journalMeta").get(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
      const value = record.result as StoredProject;
      if (!value) throw Error("The actual persisted project is missing.");
      if (value.storageVersion !== 2) throw Error("Expected a split-asset project manifest.");
      // Object-key insertion order is not document state. Canonicalize every field;
      // arrays retain their exact order, and no accounting/header/cache field is omitted.
      const rawJson = JSON.stringify(value),
        canonicalJson = JSON.stringify(value, (_key, item: unknown) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en")))
            : item,
        ),
        digest = async (text: string) =>
          Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join(""),
        [rawDigest, canonicalDigest] = await Promise.all([digest(rawJson), digest(canonicalJson)]);
      return {
        summary: {
          id: value.id,
          name: value.project.name,
          manifest: canonicalDigest,
          revision: revision.result as string,
          assetsRevision: value.assetsRevision,
          assets: assets.result as number,
          pageRevisions: value.pageRevisions,
          journal: journal.result as { next: number; count: number },
        },
        diagnostics: {
          schema: db.version,
          record: value,
          header: {
            id: value.id,
            storageVersion: value.storageVersion,
            thumbnailRenderVersion: value.thumbnailRenderVersion,
            assetsRevision: value.assetsRevision,
            writeRevision: revision.result as string,
          },
          bytes: value.bytes,
          rawJson,
          canonicalJson,
          rawDigest,
          canonicalDigest,
        },
      };
    } finally {
      db.close();
    }
  });
  await test.info().attach(`native-persisted-manifest-${label}`, {
    body: JSON.stringify(capture.diagnostics, null, 2),
    contentType: "application/json",
  });
  return capture.summary;
}

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

function expectSmallReplies(replies: SaveReply[]) {
  expect(replies.length).toBeGreaterThan(0);
  for (const reply of replies) {
    expect(reply.keys).toEqual(["id", "result"]);
    expect(reply.resultKeys).toEqual(["kind", "value"]);
    expect(reply.valueKeys).toEqual(["assetsRevision", "projectId", "writeRevision"]);
    expect(reply.bytes).toBeLessThan(2048);
    expect(reply.writeRevision).not.toBe("");
  }
}

test("native persistence reports a lost committed ACK as uncertain without retrying the write", async ({
  page,
}) => {
  const errors = captureErrors(page);
  await prepare(page);
  const before = await stored(page, "before"),
    initial = await page.evaluate(() => window.persistenceFault);
  const failure = await page.evaluate(async () => {
    window.persistenceFault.mode = "ack";
    try {
      // No edit is pending: only this explicit save can consume the fault.
      await window.musart!.save();
      return { code: "unexpected success", name: "", message: "" };
    } catch (error) {
      const value = error as Error & { code?: string };
      return { code: value.code, name: value.name, message: value.message };
    }
  });
  expect(failure).toMatchObject({
    code: "UNCERTAIN_PROJECT_WRITE",
    name: "PersistenceUncertainError",
  });
  expect(failure.message).toContain("acknowledgment was lost");
  const after = await stored(page, "after"),
    fault = await page.evaluate(() => window.persistenceFault),
    reply = fault.replies.at(-1)!;
  expect(fault.begins).toBe(initial.begins + 1);
  expect(fault.finishes).toBe(initial.finishes + 1);
  expect(fault.replies).toHaveLength(initial.replies.length + 1);
  expect(fault.crashes).toBe(1);
  expect(fault.terminated).toBe(initial.terminated + 1);
  expect(fault.live).toBeLessThanOrEqual(1);
  expect(after.revision).not.toBe(before.revision);
  expect(after.revision).toBe(reply.writeRevision);
  expect(reply.projectId).toBe(before.id);
  expect(after).toEqual({ ...before, revision: reply.writeRevision });
  expectSmallReplies(fault.replies);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});

test("native persistence rejects a missing fragment atomically and saves the next captured edit", async ({
  page,
}) => {
  const errors = captureErrors(page);
  await prepare(page);
  const before = await stored(page, "before"),
    initial = await page.evaluate(() => window.persistenceFault);
  const failure = await page.evaluate(async () => {
    window.persistenceFault.mode = "drop";
    try {
      await window.musart!.save();
      return "unexpected success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(failure).toMatch(/fragment/i);
  expect(await stored(page, "after-rejection")).toEqual(before);
  const rejected = await page.evaluate(() => window.persistenceFault);
  expect(rejected.dropped).toBe(1);
  expect(rejected.begins).toBe(initial.begins + 1);
  expect(rejected.replies).toHaveLength(initial.replies.length);
  await page.evaluate(async () => {
    window.musart!.execute({ type: "renameProject", name: "Recovered complete persistence" });
    // Public flush deliberately persists this one captured edit and its one journal commit.
    await window.musart!.flushThumbnails();
    // A separate explicit save must also work after the failed frame, without a new runtime.
    await window.musart!.save();
  });
  const after = await stored(page, "after"),
    fault = await page.evaluate(() => window.persistenceFault);
  expect(after.name).toBe("Recovered complete persistence");
  expect(after.manifest).not.toBe(before.manifest);
  expect(after.revision).toBe(fault.replies.at(-1)!.writeRevision);
  expect(after.revision).not.toBe(before.revision);
  expect(after.assets).toBe(before.assets);
  expect(after.assetsRevision).toBe(before.assetsRevision);
  expect(after.pageRevisions).toEqual(before.pageRevisions);
  expect(after.journal.next).toBe(before.journal.next + 1);
  expect(after.journal.count).toBe(before.journal.count + 1);
  expect(fault.begins).toBe(initial.begins + 3);
  expect(fault.replies).toHaveLength(initial.replies.length + 2);
  expect(fault.live).toBeLessThanOrEqual(1);
  expectSmallReplies(fault.replies);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});
