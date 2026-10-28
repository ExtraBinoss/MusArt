import { expect, it, vi } from "vitest";
import { createJournalHost } from "../../../../src/services/animation/journal/host";
import { fragmentValue } from "../../../../src/services/serialization/fragments/encode";
import type { JournalFrame, JournalResult } from "../../../../src/services/animation/journal/model";
import { frameAt } from "./fixtures";
const header: JournalResult = {
  ownNext: 0,
  meta: {
    version: 1,
    projectId: "history-project",
    first: 0,
    next: 0,
    count: 0,
    limit: 10000,
    enabled: true,
    lastAt: 0,
    lastStamp: "stamp",
    epoch: "epoch",
  },
};
function fixture() {
  const post = vi.fn(),
    processor = { run: vi.fn(async () => header), dispose: vi.fn(async () => {}) },
    create = vi.fn((_database: string) => processor),
    host = createJournalHost(post, create);
  return { post, processor, create, host };
}
function parts(host: ReturnType<typeof createJournalHost>, id: number, frame: JournalFrame) {
  const values = [...fragmentValue(frame)];
  for (const part of values) host.receive({ type: "part", id, part });
  return values.length;
}
it("assembles one admitted job and returns only its small processor header", async () => {
  const d = fixture(),
    frame = frameAt();
  d.host.receive({ type: "begin", id: 1, database: "studio", action: { kind: "ensure" } });
  const count = parts(d.host, 1, frame);
  d.host.receive({ type: "finish", id: 1, parts: count });
  await vi.waitFor(() => expect(d.post).toHaveBeenCalledExactlyOnceWith({ id: 1, result: header }));
  expect(d.processor.run).toHaveBeenCalledExactlyOnceWith({ kind: "ensure" }, frame);
  expect(JSON.stringify(d.post.mock.calls[0])).not.toContain('"pages"');
  await d.host.dispose();
  expect(d.processor.dispose).toHaveBeenCalledOnce();
  d.host.receive({ type: "begin", id: 2, database: "studio", action: { kind: "ensure" } });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 2,
    error: { message: "Journal host is disposed." },
  });
});
it("rejects dropped fragments and malformed/order/unknown messages, then accepts a clean later job", async () => {
  const d = fixture();
  for (const message of [
    null,
    {},
    { type: "begin", id: -1 },
    { type: "part", id: 3, part: { type: "base", value: {} } },
    { type: "begin", id: 4, database: "studio", action: { kind: "unknown" } },
  ])
    d.host.receive(message);
  expect(d.processor.run).not.toHaveBeenCalled();
  d.host.receive({ type: "begin", id: 5, database: "studio", action: { kind: "ensure" } });
  parts(d.host, 5, frameAt());
  d.host.receive({ type: "finish", id: 5, parts: 99 });
  expect(d.post.mock.calls.at(-1)?.[0]).toMatchObject({
    id: 5,
    error: { message: "Journal fragment count does not match." },
  });
  expect(d.processor.run).not.toHaveBeenCalled();
  d.host.receive({ type: "begin", id: 6, database: "studio", action: { kind: "ensure" } });
  d.host.receive({
    type: "part",
    id: 6,
    part: { type: "array", path: ["state"], offset: 0, total: 1, value: [1] },
  });
  expect(d.post.mock.calls.at(-1)?.[0]).toHaveProperty("error");
  d.host.receive({ type: "begin", id: 7, database: "studio", action: { kind: "ensure" } });
  const count = parts(d.host, 7, frameAt());
  d.host.receive({ type: "finish", id: 7, parts: count });
  await vi.waitFor(() => expect(d.post.mock.calls.at(-1)?.[0]).toEqual({ id: 7, result: header }));
  await d.host.dispose();
});
it("bounds admission through async processing, preserves domain errors and releases the old database on a switch", async () => {
  const d = fixture();
  let resolve!: (result: JournalResult) => void;
  d.processor.run.mockImplementationOnce(
    () =>
      new Promise<JournalResult>((done) => {
        resolve = done;
      }),
  );
  d.host.receive({ type: "begin", id: 1, database: "first", action: { kind: "ensure" } });
  const count = parts(d.host, 1, frameAt());
  d.host.receive({ type: "finish", id: 1, parts: count });
  d.host.receive({ type: "begin", id: 2, database: "second", action: { kind: "ensure" } });
  expect(d.post.mock.calls[0]?.[0]).toMatchObject({
    id: 2,
    error: { message: "A journal frame is already active." },
  });
  await vi.waitFor(() => expect(d.processor.run).toHaveBeenCalledOnce());
  resolve(header);
  await vi.waitFor(() => expect(d.post).toHaveBeenCalledWith({ id: 1, result: header }));
  d.processor.run.mockRejectedValueOnce(
    Object.assign(Error("retired"), { name: "DeletedProjectError", code: "PROJECT_DELETED" }),
  );
  d.host.receive({ type: "begin", id: 3, database: "second", action: { kind: "ensure" } });
  const next = parts(d.host, 3, frameAt());
  d.host.receive({ type: "finish", id: 3, parts: next });
  await vi.waitFor(() =>
    expect(d.post.mock.calls.at(-1)?.[0]).toEqual({
      id: 3,
      error: { name: "DeletedProjectError", message: "retired", code: "PROJECT_DELETED" },
    }),
  );
  expect(d.processor.dispose).toHaveBeenCalledOnce();
  expect(d.create.mock.calls.map(([name]) => name)).toEqual(["first", "second"]);
  await d.host.dispose();
});
it("disposal awaits an active operation but suppresses any late acknowledgment", async () => {
  const d = fixture();
  let resolve!: (result: JournalResult) => void;
  d.processor.run.mockImplementationOnce(
    () =>
      new Promise<JournalResult>((done) => {
        resolve = done;
      }),
  );
  d.host.receive({ type: "begin", id: 1, database: "studio", action: { kind: "ensure" } });
  const count = parts(d.host, 1, frameAt());
  d.host.receive({ type: "finish", id: 1, parts: count });
  const close = d.host.dispose();
  expect(d.processor.dispose).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(d.processor.run).toHaveBeenCalledOnce());
  resolve(header);
  await close;
  expect(d.post).not.toHaveBeenCalled();
  expect(d.processor.dispose).toHaveBeenCalledOnce();
});
