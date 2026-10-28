import { it, expect } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createProject, createPage } from "@musart/core";
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
