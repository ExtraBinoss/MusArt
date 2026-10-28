import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { stateFromProject } from "@musart/core";
import { fingerprintState } from "../../apps/web/src/services/history/fingerprint";
import { installReadbackProbe } from "./support/readback-probe";

interface HashProbe {
  workers: number;
  active: number;
  peak: number;
  history: number;
  thumbnail: number;
  originals: boolean;
  errors: string[];
}
declare global {
  interface Window {
    __hashProbe: HashProbe;
  }
}

test("native module-worker hashing preserves canonical history without original bytes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const stats: HashProbe = {
      workers: 0,
      active: 0,
      peak: 0,
      history: 0,
      thumbnail: 0,
      originals: false,
      errors: [],
    };
    window.__hashProbe = stats;
    class ObservedWorker extends NativeWorker {
      private readonly hashing: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.hashing = String(url).includes("hash.worker");
        if (this.hashing) {
          stats.workers++;
          this.addEventListener("message", () => {
            stats.active--;
          });
          this.addEventListener("error", (event) => stats.errors.push(event.message));
        }
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (this.hashing && message && typeof message === "object" && "job" in message) {
          const job = message.job as {
            kind: "history" | "thumbnail";
            state?: { assets?: unknown };
            sources?: [string, string][];
          };
          stats.active++;
          stats.peak = Math.max(stats.peak, stats.active);
          stats[job.kind]++;
          stats.originals ||=
            Boolean(job.state?.assets) ||
            Boolean(
              job.sources?.some(
                ([, digest]) => digest !== "missing" && !/^[a-f0-9]{64}$/.test(digest),
              ),
            );
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    }
    window.Worker = ObservedWorker;
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.locator('canvas[data-renderer-ready="true"]').waitFor();
  await page.evaluate(async () => {
    await window.musart!.flush();
    window.musart!.execute({ type: "renameProject", name: "Worker checkpoint" });
    await window.musart!.flush();
    await window.musart!.save();
  });
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  const expected = await fingerprintState(stateFromProject(project));
  const actual = await page.evaluate(async (id) => {
    const opening = indexedDB.open("musart-studio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction("journalMeta").objectStore("journalMeta").get(id);
      const meta = await new Promise<{ lastFingerprint: string }>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return {
        fingerprint: meta.lastFingerprint,
        stats: window.__hashProbe,
        reads: window.__musartVideoReadbacks,
      };
    } finally {
      db.close();
    }
  }, project.id);
  expect(actual.fingerprint).toBe(expected);
  expect(actual.stats.workers).toBe(1);
  expect(actual.stats.history).toBeGreaterThanOrEqual(2);
  expect(actual.stats.thumbnail).toBeGreaterThanOrEqual(1);
  expect(actual.stats.peak).toBeLessThanOrEqual(8);
  expect(actual.stats.active).toBe(0);
  expect(actual.stats.originals).toBe(false);
  expect(actual.stats.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(actual.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  await mkdir("artifacts/hashing", { recursive: true });
  await writeFile(
    "artifacts/hashing/native.json",
    JSON.stringify({ ...actual, browser: page.context().browser()!.version() }, null, 2),
  );
});
