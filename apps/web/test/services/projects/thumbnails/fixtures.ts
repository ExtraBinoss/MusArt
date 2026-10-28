import { vi } from "vitest";
import { createPage, createProject, type Project } from "@musart/core";
import type { ActivityPort } from "../../../../src/services/projects/thumbnails/activity";
import type {
  StoredThumbnail,
  ThumbnailStore,
} from "../../../../src/services/projects/thumbnails/model";
import { ThumbnailRenderer } from "../../../../src/services/projects/thumbnails/renderer";
export function record(patch: Partial<StoredThumbnail> = {}): StoredThumbnail {
  return {
    projectId: "project",
    pageId: "page",
    revision: "revision",
    width: 640,
    height: 480,
    updatedAt: "2026-10-27T12:00:00.000Z",
    blob: new Blob(["image"], { type: "image/webp" }),
    ...patch,
  };
}
export class Activity implements ActivityPort {
  active = false;
  listeners = new Set<() => void>();
  busy = () => this.active;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(value: boolean) {
    this.active = value;
    for (const listener of this.listeners) listener();
  }
  dispose = vi.fn();
}
export function fixture(
  project: Project = createProject({
    id: "project",
    pages: [createPage({ id: "page" }), createPage({ id: "two" })],
  }),
) {
  const records: StoredThumbnail[] = [];
  const store: ThumbnailStore = {
    load: vi.fn(async () => project),
    thumbnailInfo: vi.fn(async () =>
      records.map(({ blob, ...info }) => ({ ...info, bytes: blob.size })),
    ),
    thumbnails: vi.fn(async (_id, ids) =>
      records.filter((item) => !ids || ids.includes(item.pageId)),
    ),
    saveThumbnail: vi.fn(async (item) => {
      records.push(item);
      return true;
    }),
  };
  const renderer = new ThumbnailRenderer(async () => {
    throw new Error("Unexpected GPU");
  });
  const render = vi.spyOn(renderer, "render").mockResolvedValue({
    blob: new Blob(["frame"], { type: "image/webp" }),
    width: 768,
    height: 768,
  });
  const activity = new Activity();
  return { store, renderer, render, activity, project, records };
}
