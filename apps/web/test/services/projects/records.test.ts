import { it, expect } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createProject, createPage, createLayer, EditorEngine } from "@musart/core";
import {
  thumbnailInfo,
  thumbnailBytes,
  legacyThumbnailBytes,
  manifestBytes,
  projectSummary,
} from "../../../src/services/projects/records";
import { logicalBytes } from "../../../src/services/projects/logical-bytes";
it("separates encoded binary thumbnails from lightweight card metadata and cache counters", () => {
  const record = {
    projectId: "p",
    pageId: "page",
    revision: "hash",
    blob: new NodeBlob(["webp"], { type: "image/webp" }) as Blob,
    width: 20,
    height: 10,
    updatedAt: "2026-01-01",
  };
  const info = thumbnailInfo(record);
  expect(info.bytes).toBe(4);
  expect("blob" in info).toBe(false);
  const { bytes: _bytes, ...metadata } = info;
  expect(thumbnailBytes(record)).toBe(4 + logicalBytes(metadata));
  expect(legacyThumbnailBytes()).toBe(0);
  expect(legacyThumbnailBytes("old")).toBe(logicalBytes({ thumbnail: "old" }));
  const project = createProject({ id: "p", pages: [createPage({ id: "page" })] }),
    stored = {
      id: "p",
      project,
      thumbnail: "old",
      bytes: { manifest: 1, assets: 2, thumbnails: 3 },
      pageRevisions: { page: "hash" },
      thumbnailInfo: [info],
    };
  expect(manifestBytes(stored)).toBe(
    logicalBytes({ id: "p", project, pageRevisions: stored.pageRevisions, thumbnailInfo: [info] }),
  );
  expect(projectSummary(stored)).toMatchObject({
    id: "p",
    thumbnail: "old",
    pages: [{ id: "page", thumbnailRevision: "hash", thumbnailBytes: 4 }],
  });
  expect(projectSummary({ id: "p", project }).pages[0]).not.toHaveProperty("thumbnailRevision");
});

it("accounts cached worker page sizes exactly through metadata and thumbnail changes", () => {
  const project = createProject({
    pages: [
      createPage({
        name: "Édition 🎨",
        layers: [createLayer("text", { text: 'Quotes: " \\ \n \ud800 中文' })],
      }),
      createPage({ name: "Second" }),
    ],
  });
  const record = {
    id: project.id,
    storageVersion: 2 as const,
    project,
    assetsRevision: "originals:1",
    pageRevisions: { [project.pages[0]!.id]: "digest" },
    thumbnailInfo: [] as ReturnType<typeof thumbnailInfo>[],
    bytes: { manifest: 0, assets: 0, thumbnails: 0, pagePayloads: project.pages.map(logicalBytes) },
  };
  const exact = () => {
    const { bytes: _bytes, ...payload } = record;
    return logicalBytes(payload);
  };
  expect(manifestBytes(record)).toBe(exact());
  record.project = { ...project, name: "Renamed 🧠" };
  record.thumbnailInfo.push({
    projectId: project.id,
    pageId: project.pages[0]!.id,
    revision: "digest",
    width: 768,
    height: 512,
    updatedAt: project.updatedAt,
    bytes: 1234,
  });
  record.assetsRevision = "originals:100";
  expect(manifestBytes(record)).toBe(exact());
  for (const pagePayloads of [
    [1, 1],
    [NaN, 20],
    [],
    [20],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ]) {
    record.bytes.pagePayloads = pagePayloads;
    expect(manifestBytes(record)).toBe(exact());
  }
});

it("derives mixed Static/Motion metadata without inspecting layers or original assets", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "animated" })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const project = createProject({
    pages: [createPage({ id: "still" }), structuredClone(engine.getSnapshot().project.pages[0]!)],
  });
  Object.defineProperty(project, "assets", {
    get: () => {
      throw new Error("Original assets must not be read for listing");
    },
  });
  for (const page of project.pages)
    Object.defineProperty(page, "layers", {
      get: () => {
        throw new Error("Layer bodies must not be read for listing");
      },
    });
  const summary = projectSummary({ id: project.id, project });
  expect(summary.mode).toBe("motion");
  expect(summary.pages.map((page) => ({ id: page.id, mode: page.mode }))).toEqual([
    { id: "still", mode: "static" },
    { id: "animated", mode: "motion" },
  ]);
  expect(summary).not.toHaveProperty("assets");
  expect(summary.pages[1]).not.toHaveProperty("motion");
  expect(summary.pages[1]).not.toHaveProperty("layers");
});

it("defaults legacy artboards to Static and honors a retained timeline switched back to Static", () => {
  const legacy = createProject();
  expect(projectSummary({ id: legacy.id, project: legacy })).toMatchObject({
    mode: "static",
    pages: [{ mode: "static" }],
  });
  const engine = new EditorEngine(legacy);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(projectSummary({ id: legacy.id, project: engine.getSnapshot().project })).toMatchObject({
    mode: "static",
    pages: [{ mode: "static" }],
  });
});
