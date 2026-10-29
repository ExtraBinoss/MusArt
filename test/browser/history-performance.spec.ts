import { expect, test, type Page } from "@playwright/test";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject, stateFromProject } from "@musart/core";
import type { StoredProject } from "../../apps/web/src/services/projects/database";
import type { HistoryBase, HistoryMetadata } from "../../apps/web/src/services/history/model";
import { THUMBNAIL_RENDER_VERSION } from "../../apps/web/src/services/projects/thumbnails/model";
import { installHistoryIdbProbe, type HistoryIdbObserver } from "./support/history-idb-probe";
const count = 100000;
const schema = 6;
function fixture() {
  const original = {
    id: "original",
    name: "Original SVG bytes stored once",
    mime: "image/svg+xml",
    width: 8,
    height: 8,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><!--' + "source ".repeat(10000) + '--><path fill="#4488cc" d="M0 0h8v8H0z"/></svg>').toString("base64")}`,
  };
  return createProject({
    assets: { original },
    id: "native-history-100k",
    name: "Native IndexedDB · 100,000 edits",
    updatedAt: "2026-10-27T12:00:00.000Z",
    pages: [
      createPage({
        id: "history-page",
        width: 600,
        height: 400,
        layers: Array.from({ length: 50 }, (_, index) =>
          createLayer(index === 0 ? "image" : "rectangle", {
            assetId: index === 0 ? "original" : null,
            id: `layer-${index}`,
            name: `Artwork ${index}`,
            x: index * 3,
            y: index * 2,
            width: 60,
            height: 40,
            fill: "#4488cc",
            radius: 4,
          }),
        ),
      }),
    ],
  });
}

async function accounting(page: Page) {
  return page.evaluate(async (version) => {
    const id = window.musart!.snapshot().project.id,
      opening = indexedDB.open("musart-studio", version),
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
    try {
      const tx = db.transaction(["projects", "journalMeta", "journalBase"]),
        get = <T>(store: string) =>
          new Promise<T>((resolve, reject) => {
            const request = tx.objectStore(store).get(id);
            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(request.error);
          }),
        [manifest, meta, base] = await Promise.all([
          get<StoredProject>("projects"),
          get<HistoryMetadata>("journalMeta"),
          get<HistoryBase>("journalBase"),
        ]);
      return {
        schema: db.version,
        project: manifest.bytes,
        history: meta.bytes,
        written: meta.eventBytesWritten,
        pruned: meta.eventBytesPruned,
        baseBytes: new TextEncoder().encode(JSON.stringify(base)).byteLength,
      };
    } finally {
      db.close();
    }
  }, schema);
}

async function replayProbe(page: Page, probes: HistoryIdbObserver) {
  return probes.measure(() =>
    page.evaluate(async () => {
      const start = performance.now(),
        spec = await window.musart!.historyReplay();
      const ready = performance.now() - start;
      const current = structuredClone(spec.initial);
      for (const event of spec.events) {
        if (event.after) {
          current.pages = structuredClone(event.after.pages);
          continue;
        }
        for (const delta of event.delta) {
          if (delta.op !== "set") throw new Error("Unexpected fixture delta");
          let object = current as unknown as Record<string | number, unknown>;
          for (const key of delta.path.slice(0, -1))
            object = object[key] as Record<string | number, unknown>;
          object[delta.path.at(-1)!] = delta.value;
        }
      }
      return {
        prepareMs: ready,
        events: spec.events.length,
        initialAt: spec.events[0]!.at,
        lastAt: spec.events.at(-1)!.at,
        duration: spec.duration,
        initialX: spec.initial.pages[0]!.layers.map((layer) => layer.x),
        finalX: current.pages[0]!.layers.map((layer) => layer.x),
        originals: Object.keys(spec.initial.assets).length,
        futureOriginals: Object.keys(spec.assets).length,
        originalHash: [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(spec.initial.assets.original!.dataUrl),
            ),
          ),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
      };
    }),
  );
}

test("100,000 native journal events: cold document opens without reading history, pages remain bounded, checkpoint pruning stays local", async ({
  page,
}) => {
  test.setTimeout(600000);
  const project = fixture(),
    base = stateFromProject(project);
  await page.route("**/__history_seed__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Preparing native history fixture</body></html>",
    }),
  );
  await page.goto("/__history_seed__");
  const seeded = await page.evaluate(
    async ({ project, base, count, schema, rendererVersion }) => {
      const start = performance.now(),
        opening = indexedDB.open("musart-studio", schema);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        db.createObjectStore("projects", { keyPath: "id" }).createIndex("by-updated", [
          "project.updatedAt",
          "id",
        ]);
        db.createObjectStore("preferences");
        const originals = db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] });
        originals.createIndex("by-project", "projectId");
        db.createObjectStore("journalMeta", { keyPath: "projectId" });
        db.createObjectStore("journalBase", { keyPath: "projectId" });
        const events = db.createObjectStore("journalEvents", {
          keyPath: ["projectId", "sequence"],
        });
        events.createIndex("by-project", "projectId");
        events.createIndex("by-checkpoint", ["projectId", "event.after.id", "sequence"]);
        events.createIndex("by-operation", ["projectId", "operationId"], { unique: true });
        const assets = db.createObjectStore("journalAssets", { keyPath: ["projectId", "assetId"] });
        assets.createIndex("by-project", "projectId");
        db.createObjectStore("thumbnails", { keyPath: ["projectId", "pageId"] }).createIndex(
          "by-project",
          "projectId",
        );
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      const state = structuredClone(base),
        encoder = new TextEncoder();
      const logicalBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength;
      let bytes = 0,
        pruneBoundaryBytes = 0,
        checkpoints = 0;
      for (let offset = 0; offset < count; offset += 5000) {
        const tx = db.transaction("journalEvents", "readwrite"),
          store = tx.objectStore("journalEvents");
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        for (let sequence = offset; sequence < Math.min(count, offset + 5000); sequence++) {
          const index = sequence % 50,
            value = Math.floor(sequence / 50) / 10;
          state.pages[0]!.layers[index]!.x = value;
          const after = (sequence + 1) % 250 === 0 ? structuredClone(state) : undefined;
          if (after) checkpoints++;
          const row = {
            projectId: project.id,
            sequence,
            event: {
              at: (sequence + 1) * 10,
              projectId: project.id,
              pageId: project.pages[0]!.id,
              kind: "commit",
              commands: [{ type: "updateLayers", summary: true }],
              delta: after ? [] : [{ op: "set", path: ["pages", 0, "layers", index, "x"], value }],
              ...(after ? { after } : {}),
            },
          };
          // Match eventBytes(): prefix accounting is a cache, excluded from the payload total.
          bytes += logicalBytes(row);
          if (sequence === count - 10000 - 1) pruneBoundaryBytes = bytes;
          store.put({ ...row, cumulativeBytes: bytes });
        }
        await done;
      }
      const canonical = (input: unknown) =>
        JSON.stringify(input, (_key, value: unknown) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")))
            : value,
        );
      const digest = async (value: string) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      const fingerprint = await digest(canonical(state));
      const finalProject = { ...project, pages: state.pages };
      const metadata: Record<string, Omit<(typeof project.assets)[string], "dataUrl">> = {};
      const originals = [],
        journalOriginals = [],
        sourceDigests: Record<string, string> = {};
      for (const asset of Object.values(project.assets)) {
        const { dataUrl, ...description } = asset;
        metadata[asset.id] = description;
        originals.push({ projectId: project.id, assetId: asset.id, dataUrl });
        journalOriginals.push({ projectId: project.id, assetId: asset.id, asset });
        sourceDigests[asset.id] = await digest(dataUrl);
      }
      const pageRevisions = Object.fromEntries(
        await Promise.all(
          state.pages.map(async (page) => {
            const ids = [
              ...new Set(
                page.layers
                  .flatMap((layer) => [layer.assetId, layer.mask?.assetId])
                  .filter((id): id is string => !!id),
              ),
            ].sort();
            const layers = page.layers.map((layer) => {
              const {
                name: _name,
                locked: _locked,
                guides: _guides,
                margin: _margin,
                padding: _padding,
                ...paint
              } = layer;
              return {
                ...paint,
                effects: layer.effects.map(({ id: _id, ...effect }) => effect),
                ...(layer.vector ? { vector: { ...layer.vector, attribution: undefined } } : {}),
              };
            });
            return [
              page.id,
              await digest(
                canonical({
                  version: rendererVersion,
                  width: page.width,
                  height: page.height,
                  background: page.background,
                  colorSpace: page.colorSpace ?? "srgb",
                  layers,
                  sources: ids.map((id) => [id, sourceDigests[id]]),
                }),
              ),
            ];
          }),
        ),
      );
      const manifest = {
        id: project.id,
        storageVersion: 2,
        assetsRevision: "assets:1",
        project: { ...finalProject, assets: metadata },
        pageRevisions,
        thumbnailRenderVersion: rendererVersion,
        thumbnailInfo: [],
      };
      const projectBytes = {
        manifest: logicalBytes(manifest),
        assets: originals.reduce((sum, record) => sum + logicalBytes(record), 0),
        thumbnails: 0,
      };
      const historyBase = {
        projectId: project.id,
        pageId: project.pages[0]!.id,
        state: base,
        at: 0,
      };
      const historyBytes = {
        events: bytes,
        assets: journalOriginals.reduce((sum, record) => sum + logicalBytes(record), 0),
        base: logicalBytes(historyBase),
      };
      const tx = db.transaction(
        ["projects", "preferences", "journalBase", "journalMeta", "assets", "journalAssets"],
        "readwrite",
      );
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      for (const original of originals) tx.objectStore("assets").put(original);
      for (const original of journalOriginals) tx.objectStore("journalAssets").put(original);
      tx.objectStore("projects").put({ ...manifest, bytes: projectBytes });
      tx.objectStore("preferences").put(project.id, "last-project");
      tx.objectStore("preferences").put("1", "asset-revision-sequence");
      tx.objectStore("journalBase").put(historyBase);
      tx.objectStore("journalMeta").put({
        version: 1,
        projectId: project.id,
        first: 0,
        next: count,
        count,
        limit: 100000,
        enabled: true,
        lastAt: count * 10,
        lastStamp: project.updatedAt,
        lastFingerprint: fingerprint,
        bytes: historyBytes,
        eventBytesWritten: bytes,
        eventBytesPruned: 0,
      });
      await done;
      db.close();
      return {
        seedMs: performance.now() - start,
        logicalEventBytes: bytes,
        accounting: { project: projectBytes, history: historyBytes },
        pruneBoundaryBytes,
        naiveSnapshotBytes: encoder.encode(JSON.stringify(state)).byteLength * count,
        naiveProjectBytes: encoder.encode(JSON.stringify(finalProject)).byteLength * count,
        originalBytes: encoder.encode(JSON.stringify(project.assets)).byteLength,
        originalHash: sourceDigests.original,
        checkpoints,
        finalX: state.pages[0]!.layers.map((layer) => layer.x),
      };
    },
    { project, base, count, schema, rendererVersion: THUMBNAIL_RENDER_VERSION },
  );
  expect(seeded.checkpoints).toBe(count / 250);
  await test.info().attach("native-seed-summary", {
    body: JSON.stringify(seeded, null, 2),
    contentType: "application/json",
  });
  const gate = process.env.MUSART_HISTORY_GATE;
  if (gate) {
    await writeFile(`${gate}.seeded`, JSON.stringify(seeded));
    let released = false;
    for (let attempt = 0; attempt < 360; attempt++) {
      try {
        await access(gate);
        released = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    expect(released, "CPU-idle benchmark gate").toBe(true);
  }
  const probes = await installHistoryIdbProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const cold = await probes.measure(
    () =>
      page.evaluate(async () => {
        const start = performance.now(),
          info = await window.musart!.historyInfo();
        return {
          info,
          headerMs: performance.now() - start,
          appReadyMs: performance.now(),
          snapshot: window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.x),
        };
      }),
    false,
  );
  expect(cold.info.events).toBe(count);
  expect(cold.info.error).toBe(false);
  expect(cold.probe.reads).toBe(0);
  expect(cold.probe.rows).toBe(0);
  expect(cold.snapshot).toEqual(seeded.finalX);
  expect(cold.appReadyMs).toBeLessThan(30000);
  const coldAccounting = await accounting(page);
  expect(coldAccounting.schema).toBe(schema);
  expect(coldAccounting.history).toEqual(seeded.accounting.history);
  expect(coldAccounting.project?.assets).toBe(seeded.accounting.project.assets);
  expect(coldAccounting.written).toBe(seeded.logicalEventBytes);
  expect(coldAccounting.pruned).toBe(0);
  expect(coldAccounting.baseBytes).toBe(seeded.accounting.history.base);
  const first = await probes.measure(() =>
    page.evaluate(async () => {
      const start = performance.now(),
        result = await window.musart!.historyPage();
      return { result, ms: performance.now() - start };
    }),
  );
  const second = await probes.measure(() =>
    page.evaluate(async (before) => {
      const start = performance.now(),
        result = await window.musart!.historyPage(before);
      return { result, ms: performance.now() - start };
    }, first.result.before!),
  );
  const pages = {
    ms: first.ms + second.ms,
    first: first.result.entries.map((row) => row.sequence),
    second: second.result.entries.map((row) => row.sequence),
    total: first.result.total,
    firstProbe: first.probe,
    secondProbe: second.probe,
    firstProbeRealms: first.probeRealms,
    secondProbeRealms: second.probeRealms,
  };
  expect(pages.first).toHaveLength(100);
  expect(pages.second).toHaveLength(100);
  expect(pages.total).toBe(count);
  expect(new Set([...pages.first, ...pages.second]).size).toBe(200);
  expect(pages.firstProbe.rows).toBeLessThanOrEqual(101);
  expect(pages.secondProbe.rows).toBeLessThanOrEqual(101);
  expect(pages.first[0]).toBe(count - 1);
  expect(pages.second[0]).toBe(count - 101);
  const fullReplay = await replayProbe(page, probes);
  expect(fullReplay.events).toBe(count);
  expect(fullReplay.finalX).toEqual(seeded.finalX);
  expect(fullReplay.initialX).toEqual(project.pages[0]!.layers.map((layer) => layer.x));
  expect(fullReplay.finalX).not.toEqual(fullReplay.initialX);
  expect(fullReplay.originals).toBe(1);
  expect(fullReplay.futureOriginals).toBe(0);
  expect(fullReplay.originalHash).toBe(seeded.originalHash);
  expect(fullReplay.probe.requests.getAll).toBe(1000);
  expect(fullReplay.probe.rows).toBe(count);
  // The same validated journal configuration port is available in the UI and headless API.
  const pruning = await probes.measure(() =>
    page.evaluate(async () => {
      const start = performance.now();
      await window.musart!.historyConfigure({ limit: 10000 });
      return {
        ms: performance.now() - start,
        info: await window.musart!.historyInfo(),
      };
    }),
  );
  await test.info().attach("native-prune-summary", {
    body: JSON.stringify(pruning, null, 2),
    contentType: "application/json",
  });
  expect(pruning.info.events).toBe(10000);
  expect(pruning.info.limit).toBe(10000);
  expect(pruning.probe.rows).toBeLessThanOrEqual(250);
  expect(pruning.probe.checkpointRows).toBeLessThanOrEqual(1);
  expect(pruning.probe.eventWrites).toBe(1);
  const prunedAccounting = await accounting(page);
  expect(prunedAccounting.history?.events).toBe(
    seeded.logicalEventBytes - seeded.pruneBoundaryBytes,
  );
  expect(prunedAccounting.pruned).toBe(seeded.pruneBoundaryBytes);
  expect(prunedAccounting.written).toBe(seeded.logicalEventBytes);
  expect(prunedAccounting.history?.assets).toBe(seeded.accounting.history.assets);
  expect(prunedAccounting.history?.base).toBe(prunedAccounting.baseBytes);
  const replay = await replayProbe(page, probes);
  expect(replay.events).toBe(10000);
  expect(replay.finalX).not.toEqual(replay.initialX);
  expect(replay.initialX).toEqual(Array.from({ length: 50 }, () => 179.9));
  expect(replay.originalHash).toBe(seeded.originalHash);
  expect(replay.finalX).toEqual(seeded.finalX);
  expect(replay.initialAt).toBe(10);
  expect(replay.lastAt).toBe(replay.duration);
  expect(replay.probe.requests.getAll).toBe(100);
  expect(replay.probe.rows).toBe(10000);
  const autosave = await probes.measure(() =>
    page.evaluate(async () => {
      for (let index = 0; index < 40; index++)
        window.musart!.execute({
          type: "updateLayers",
          ids: ["layer-0"],
          patch: { x: 200 + index },
        });
      await window.musart!.flush();
      await new Promise((resolve) => setTimeout(resolve, 550));
      await window.musart!.flush();
      return {
        info: await window.musart!.historyInfo(),
      };
    }),
  );
  expect(autosave.info.error).toBe(false);
  expect(autosave.probe.manifestWrites).toBeLessThanOrEqual(2);
  expect(autosave.probe.assetWrites).toBe(0);
  expect(autosave.probe.eventWrites).toBeLessThanOrEqual(41);
  expect(autosave.probe.requests.getAll ?? 0).toBe(0);
  const artifact = {
    browser: "Chromium native IndexedDB",
    schema,
    accountingBasis:
      "Logical UTF-8 JSON payloads, excluding cached byte counters and cumulative prefixes",
    layers: 50,
    events: count,
    seeded,
    cold: { ...cold, snapshot: undefined },
    pages,
    fullReplay,
    prune: pruning,
    replay,
    autosave,
    accounting: { cold: coldAccounting, pruned: prunedAccounting },
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/performance-history.json", JSON.stringify(artifact, null, 2));
  expect(seeded.logicalEventBytes).toBeLessThan(seeded.naiveSnapshotBytes / 10);
});
