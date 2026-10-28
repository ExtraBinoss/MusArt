import { expect, test, vi } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { sendHashFragments } from "../../../../src/services/serialization/hashing/transport";
import { FragmentAssembly } from "../../../../src/services/serialization/fragments/assembly";
import type { HashRequest } from "../../../../src/services/serialization/hashing/protocol";

test("yields between bounded native snapshots and preserves complex page values exactly", async () => {
  const job = {
    kind: "thumbnail" as const,
    page: createPage({
      layers: Array.from({ length: 90 }, () => createLayer("text", { text: "É🙂".repeat(5000) })),
    }),
    sources: [["asset", "a".repeat(64)]] as const,
  };
  const messages: HashRequest[] = [],
    assembly = new FragmentAssembly();
  const port = { postMessage: (message: HashRequest) => messages.push(structuredClone(message)) };
  const yieldTask = vi.fn(async () => {});
  await sendHashFragments(port, 7, job, new AbortController().signal, () => true, yieldTask);
  for (const message of messages) {
    expect(message.id).toBe(7);
    if (message.type === "hash-part") {
      expect(JSON.stringify(message).length).toBeLessThan(40000);
      assembly.add(message.part);
    }
  }
  expect(assembly.finish()).toEqual(job);
  expect(yieldTask).toHaveBeenCalledTimes(messages.length - 1);
  expect(messages.at(-1)).toEqual({ type: "finish-hash", id: 7, parts: messages.length - 1 });
});

test("stops before sending stale, canceled or failed chunks without a finish message", async () => {
  const job = { kind: "thumbnail" as const, page: createPage(), sources: [] };
  const abort = new AbortController(),
    port = { postMessage: vi.fn() };
  await expect(
    sendHashFragments(
      port,
      1,
      job,
      abort.signal,
      () => false,
      async () => {},
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(port.postMessage).not.toHaveBeenCalled();
  await expect(
    sendHashFragments(
      port,
      1,
      job,
      abort.signal,
      () => true,
      async () => {
        abort.abort();
      },
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(port.postMessage).not.toHaveBeenCalled();
  port.postMessage.mockImplementation(() => {
    throw new Error("clone failed");
  });
  await expect(
    sendHashFragments(
      port,
      1,
      job,
      new AbortController().signal,
      () => true,
      async () => {},
    ),
  ).rejects.toThrow("clone failed");
  expect(port.postMessage).toHaveBeenCalledOnce();
});

test("rechecks scope after the final part before authorizing computation", async () => {
  const job = { kind: "thumbnail" as const, page: createPage(), sources: [] };
  let current = true;
  const messages: HashRequest[] = [];
  await expect(
    sendHashFragments(
      {
        postMessage(message) {
          messages.push(message);
          if (message.type === "hash-part" && message.part.type === "base") current = false;
        },
      },
      1,
      job,
      new AbortController().signal,
      () => current,
      async () => {},
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(messages.some((message) => message.type === "finish-hash")).toBe(false);
});
