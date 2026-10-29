import type { Page } from "@playwright/test";

export interface HistoryIdbProbe {
  reads: number;
  rows: number;
  checkpointRows: number;
  eventWrites: number;
  manifestWrites: number;
  assetWrites: number;
  requests: Record<string, number>;
}
interface ProbeScope {
  __journalProbe: HistoryIdbProbe;
  __resetJournalProbe: () => void;
}

/** Serialized into both real realms before their application code can touch IndexedDB. */
function instrumentHistoryIdb() {
  const scope = globalThis as unknown as ProbeScope;
  const empty = (): HistoryIdbProbe => ({
    reads: 0,
    rows: 0,
    checkpointRows: 0,
    eventWrites: 0,
    manifestWrites: 0,
    assetWrites: 0,
    requests: {},
  });
  scope.__journalProbe = empty();
  scope.__resetJournalProbe = () => {
    scope.__journalProbe = empty();
  };
  for (const name of ["get", "getAll", "openCursor", "count", "put", "add", "delete"] as const) {
    const original = IDBObjectStore.prototype[name];
    Object.defineProperty(IDBObjectStore.prototype, name, {
      configurable: true,
      value: function (this: IDBObjectStore, ...args: unknown[]) {
        const probe = scope.__journalProbe;
        const events = this.name === "journalEvents",
          write = ["put", "add", "delete"].includes(name);
        if (events) {
          probe.requests[name] = (probe.requests[name] ?? 0) + 1;
          if (write) probe.eventWrites++;
          else probe.reads++;
        }
        if (this.name === "projects" && write) probe.manifestWrites++;
        if (this.name === "assets" && write) probe.assetWrites++;
        const request = Reflect.apply(original, this, args) as IDBRequest;
        if (events && !write && name !== "count")
          request.addEventListener("success", () => {
            const result: unknown = request.result;
            if (Array.isArray(result)) probe.rows += result.length;
            else if (result !== undefined && result !== null) probe.rows++;
          });
        return request;
      },
    });
  }
  const original = IDBIndex.prototype.openCursor;
  IDBIndex.prototype.openCursor = function (...args) {
    const request = Reflect.apply(original, this, args) as IDBRequest<IDBCursorWithValue | null>;
    if (this.objectStore.name === "journalEvents")
      request.addEventListener("success", () => {
        if (request.result) scope.__journalProbe.checkpointRows++;
      });
    return request;
  };
}

export async function installHistoryIdbProbe(page: Page) {
  await page.addInitScript(instrumentHistoryIdb);
  // The prefix runs before the worker installs its message handler. An evaluate after the
  // worker-created event alone could miss the initial ensure transaction.
  await page.route(/\/journal\.worker(?:[-./?]|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `(${instrumentHistoryIdb.toString()})();\n${await response.text()}`,
    });
  });
  const workers = () => page.workers().filter((worker) => worker.url().includes("journal.worker"));
  const snapshot = async () => {
    const main = await page.evaluate(() =>
      structuredClone((globalThis as unknown as ProbeScope).__journalProbe),
    );
    const active = workers();
    if (active.length !== 1)
      throw Error(`Expected one native journal worker, got ${active.length}.`);
    const background = await Promise.all(
      active.map((worker) =>
        worker.evaluate(() =>
          structuredClone((globalThis as unknown as ProbeScope).__journalProbe),
        ),
      ),
    );
    const aggregate: HistoryIdbProbe = { ...main, requests: { ...main.requests } };
    for (const probe of background) {
      if (!probe) throw Error("Native journal worker IndexedDB probe was not installed.");
      for (const key of [
        "reads",
        "rows",
        "checkpointRows",
        "eventWrites",
        "manifestWrites",
        "assetWrites",
      ] as const)
        aggregate[key] += probe[key];
      for (const [key, value] of Object.entries(probe.requests))
        aggregate.requests[key] = (aggregate.requests[key] ?? 0) + value;
    }
    return { probe: aggregate, probeRealms: { window: main, workers: background } };
  };
  const reset = async () => {
    await page.evaluate(() => (globalThis as unknown as ProbeScope).__resetJournalProbe());
    await Promise.all(
      workers().map((worker) =>
        worker.evaluate(() => (globalThis as unknown as ProbeScope).__resetJournalProbe()),
      ),
    );
  };
  return {
    async measure<T extends object>(operation: () => Promise<T>, clear = true) {
      if (clear) await reset();
      const result = await operation();
      return { ...result, ...(await snapshot()) };
    },
  };
}

export type HistoryIdbObserver = Awaited<ReturnType<typeof installHistoryIdbProbe>>;
