import { afterEach, expect, it, vi } from "vitest";
import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../../../../src/services/projects/database";
import { createPersistenceHost } from "../../../../src/services/projects/persistence/host";
import { persistProjectWrite } from "../../../../src/services/projects/persistence/transaction";
import { persistThumbnail } from "../../../../src/services/projects/persistence/thumbnail";
import {
  readThumbnailInfo,
  readThumbnails,
} from "../../../../src/services/projects/persistence/reads";
import { fragmentValue } from "../../../../src/services/serialization/fragments/encode";
import { prepared } from "./fixtures";
vi.mock("../../../../src/services/projects/persistence/transaction", () => ({
  persistProjectWrite: vi.fn(),
}));
vi.mock("../../../../src/services/projects/persistence/thumbnail", () => ({
  persistThumbnail: vi.fn(),
}));
vi.mock("../../../../src/services/projects/persistence/reads", () => ({
  readThumbnailInfo: vi.fn(),
  readThumbnails: vi.fn(),
}));
const result = { projectId: "project", assetsRevision: "assets:1", writeRevision: "write:1" };
const hosts: ReturnType<typeof createPersistenceHost>[] = [];
const releases: (() => void)[] = [];
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});
function pauseWrite() {
  let release!: () => void;
  const pending = new Promise<typeof result>((done) => {
    release = () => done(result);
  });
  releases.push(release);
  vi.mocked(persistProjectWrite).mockReturnValueOnce(pending);
  return release;
}
function fixture() {
  const post = vi.fn(),
    close = vi.fn(),
    db = { close } as unknown as IDBPDatabase<StudioDatabase>,
    open = vi.fn(async (_name: string) => db),
    host = createPersistenceHost(post, open);
  hosts.push(host);
  vi.mocked(persistProjectWrite).mockReset().mockResolvedValue(result);
  vi.mocked(persistThumbnail).mockReset().mockResolvedValue(false);
  vi.mocked(readThumbnailInfo).mockReset().mockResolvedValue([]);
  vi.mocked(readThumbnails).mockReset().mockResolvedValue([]);
  return { post, close, db, open, host };
}
function send(d: ReturnType<typeof fixture>, id: number, database = "studio") {
  const { frame } = prepared(),
    parts = [...fragmentValue(frame)];
  d.host.receive({ type: "begin", id, database });
  for (const part of parts) d.host.receive({ type: "part", id, part });
  d.host.receive({ type: "finish", id, parts: parts.length });
  return frame;
}
it("assembles one immutable write, forwards the real transaction result and releases database ownership", async () => {
  const d = fixture(),
    frame = send(d, 1);
  await vi.waitFor(() =>
    expect(d.post).toHaveBeenCalledWith({ id: 1, result: { kind: "save", value: result } }),
  );
  expect(persistProjectWrite).toHaveBeenCalledExactlyOnceWith(d.db, frame);
  expect(d.open).toHaveBeenCalledExactlyOnceWith("studio");
  expect(JSON.stringify(d.post.mock.calls)).not.toContain("pages");
  await d.host.dispose();
  expect(d.close).toHaveBeenCalledOnce();
  d.host.receive({ type: "begin", id: 2, database: "studio" });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 2,
    error: { message: "Project persistence host is disposed." },
  });
});
it("rejects malformed, unknown and incomplete fragments without opening a transaction, then accepts a fresh frame", async () => {
  const d = fixture();
  for (const message of [
    null,
    {},
    { type: "begin", id: -1 },
    { type: "begin", id: 1, database: "" },
    { type: "part", id: 7, part: { type: "base", value: {} } },
  ])
    d.host.receive(message);
  d.host.receive({ type: "begin", id: 2, database: "studio" });
  d.host.receive({ type: "part", id: 2, part: { type: "base", value: {} } });
  d.host.receive({ type: "finish", id: 2, parts: 99 });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 2,
    error: { message: "Project persistence fragment count does not match." },
  });
  d.host.receive({ type: "begin", id: 3, database: "studio" });
  d.host.receive({
    type: "part",
    id: 3,
    part: { type: "array", path: [], offset: 0, total: 1, value: [1] },
  });
  expect(d.post.mock.calls.at(-1)?.[0]).toHaveProperty("error");
  expect(d.open).not.toHaveBeenCalled();
  expect(persistProjectWrite).not.toHaveBeenCalled();
  send(d, 4);
  await vi.waitFor(() =>
    expect(d.post.mock.calls.at(-1)?.[0]).toHaveProperty("result.kind", "save"),
  );
});
it("rejects oversized UTF-16 assembly before database access without constructing the declared giant string", () => {
  const d = fixture(),
    chunk = "x".repeat(8192),
    total = 64 * 1024 * 1024;
  d.host.receive({ type: "begin", id: 1, database: "studio" });
  d.host.receive({ type: "part", id: 1, part: { type: "base", value: { data: "" } } });
  let sent = 0;
  for (let offset = 0; offset < total; offset += chunk.length) {
    d.host.receive({
      type: "part",
      id: 1,
      part: { type: "string", path: ["data"], offset, total, value: chunk },
    });
    sent++;
    if (d.post.mock.calls.length) break;
  }
  expect(sent).toBeLessThan(total / chunk.length);
  expect(sent).toBeGreaterThan(8000);
  expect(d.post).toHaveBeenCalledExactlyOnceWith({
    id: 1,
    error: { name: "Error", message: "Fragmented value exceeds its input budget." },
  });
  expect(d.open).not.toHaveBeenCalled();
  expect(persistProjectWrite).not.toHaveBeenCalled();
  expect(persistThumbnail).not.toHaveBeenCalled();
});
it("keeps admission until a transaction settles and switches connections only after completed writes", async () => {
  const d = fixture(),
    release = pauseWrite();
  send(d, 1, "first");
  d.host.receive({ type: "begin", id: 2, database: "second" });
  expect(d.post.mock.calls[0]?.[0]).toMatchObject({
    id: 2,
    error: { message: "A project persistence request is already active." },
  });
  await vi.waitFor(() => expect(persistProjectWrite).toHaveBeenCalledOnce());
  release();
  await vi.waitFor(() =>
    expect(d.post).toHaveBeenCalledWith({ id: 1, result: { kind: "save", value: result } }),
  );
  vi.mocked(persistProjectWrite).mockRejectedValueOnce(
    Object.assign(Error("retired"), { code: "PROJECT_DELETED", name: "DeletedProjectError" }),
  );
  send(d, 3, "second");
  await vi.waitFor(() =>
    expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 3,
      error: { code: "PROJECT_DELETED", name: "DeletedProjectError", message: "retired" },
    }),
  );
  expect(d.close).toHaveBeenCalledOnce();
  expect(d.open.mock.calls.map(([name]) => name)).toEqual(["first", "second"]);
});
it("drains an admitted write on disposal without posting a late acknowledgment", async () => {
  const d = fixture(),
    release = pauseWrite();
  send(d, 1);
  const closing = d.host.dispose();
  await vi.waitFor(() => expect(persistProjectWrite).toHaveBeenCalledOnce());
  expect(d.close).not.toHaveBeenCalled();
  release();
  await closing;
  expect(d.post).not.toHaveBeenCalled();
  expect(d.close).toHaveBeenCalledOnce();
});
it("routes bounded thumbnail reads through the owned connection and preserves each result kind", async () => {
  const d = fixture();
  d.host.receive({ type: "info", id: 1, database: "studio", projectId: "project" });
  await vi.waitFor(() =>
    expect(d.post).toHaveBeenCalledWith({ id: 1, result: { kind: "info", value: [] } }),
  );
  expect(readThumbnailInfo).toHaveBeenCalledExactlyOnceWith(d.db, "project");
  const pageIds = ["page"];
  d.host.receive({
    type: "thumbnails",
    id: 2,
    database: "studio",
    projectId: "project",
    pageIds,
  });
  await vi.waitFor(() =>
    expect(d.post).toHaveBeenCalledWith({ id: 2, result: { kind: "thumbnails", value: [] } }),
  );
  expect(readThumbnails).toHaveBeenCalledExactlyOnceWith(d.db, "project", pageIds);
  d.host.receive({ type: "thumbnails", id: 3, database: "studio", projectId: "project" });
  await vi.waitFor(() => expect(readThumbnails).toHaveBeenCalledTimes(2));
  expect(readThumbnails).toHaveBeenLastCalledWith(d.db, "project", undefined);
  d.host.receive({
    type: "thumbnails",
    id: 4,
    database: "studio",
    projectId: "project",
    pageIds,
    allowStale: true,
  });
  await vi.waitFor(() => expect(readThumbnails).toHaveBeenCalledTimes(3));
  expect(readThumbnails).toHaveBeenLastCalledWith(d.db, "project", pageIds, true);
  expect(d.open).toHaveBeenCalledOnce();
  expect(persistProjectWrite).not.toHaveBeenCalled();
});
it("rejects invalid read identities before database access and can retry after an open failure", async () => {
  const d = fixture();
  d.host.receive({ type: "info", id: 1, database: "studio", projectId: "" });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 1,
    error: { message: "Invalid thumbnail project." },
  });
  expect(d.open).not.toHaveBeenCalled();
  d.host.receive({
    type: "thumbnails",
    id: 4,
    database: "studio",
    projectId: "project",
    allowStale: "yes",
  });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 4,
    error: { message: "Invalid thumbnail stale option." },
  });
  expect(d.open).not.toHaveBeenCalled();
  d.open.mockRejectedValueOnce(Error("database unavailable"));
  send(d, 2);
  await vi.waitFor(() =>
    expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 2,
      error: { message: "database unavailable" },
    }),
  );
  expect(persistProjectWrite).not.toHaveBeenCalled();
  send(d, 3);
  await vi.waitFor(() => expect(persistProjectWrite).toHaveBeenCalledOnce());
  expect(d.open).toHaveBeenCalledTimes(2);
});
it("passes a thumbnail record to the canonical transaction and acknowledges its real rejected-revision result", async () => {
  const d = fixture(),
    record = {
      projectId: "project",
      pageId: "page",
      revision: "pixels",
      width: 1,
      height: 1,
      updatedAt: "2026-10-28T00:00:00.000Z",
      blob: new Blob(["preview"], { type: "image/webp" }),
    };
  d.host.receive({ type: "thumbnail", id: 1, database: "studio", record });
  await vi.waitFor(() =>
    expect(d.post).toHaveBeenCalledWith({ id: 1, result: { kind: "thumbnail", value: false } }),
  );
  expect(persistThumbnail).toHaveBeenCalledExactlyOnceWith(d.db, record);
  expect(persistProjectWrite).not.toHaveBeenCalled();
});
