import { afterEach, expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { getCanonicalPresentation } from "../../../../src/state/session/canonical-presentation";
import { captureJournalFrame } from "../../../../src/services/animation/journal/frame";
import type {
  JournalRequest,
  JournalResponse,
  JournalWorkerPort,
} from "../../../../src/services/animation/journal/model";
import { JournalTransport } from "../../../../src/services/animation/journal/transport";
import { JournalTransportError } from "../../../../src/services/animation/journal/protocol";
import { FragmentBudgetError } from "../../../../src/services/serialization/fragments/encode";
import { projectAt } from "../../history/fixtures";

const result = {
  ownNext: 0,
  meta: {
    version: 1 as const,
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
class WorkerPort implements JournalWorkerPort {
  onmessage: JournalWorkerPort["onmessage"] = null;
  onerror: JournalWorkerPort["onerror"] = null;
  onmessageerror: JournalWorkerPort["onmessageerror"] = null;
  terminate = vi.fn();
  messages: JournalRequest[] = [];
  reply: "success" | "quota" | "malformed" | "none" = "success";
  postMessage(message: JournalRequest) {
    this.messages.push(structuredClone(message));
    if (message.type !== "finish" || this.reply === "none") return;
    const data: JournalResponse | null =
      this.reply === "success"
        ? { id: message.id, result }
        : this.reply === "quota"
          ? {
              id: message.id,
              error: { name: "QuotaExceededError", message: "Full", code: "QUOTA" },
            }
          : null;
    this.onmessage?.({ data } as MessageEvent);
  }
}
function fixture(
  options: { yieldTask?: (signal: AbortSignal) => Promise<void>; timeout?: number } = {},
) {
  const engine = new EditorEngine(projectAt()),
    presentation = getCanonicalPresentation(engine),
    worker = new WorkerPort();
  const transport = new JournalTransport(presentation, {
    worker: () => worker,
    yieldTask: async () => {},
    ...options,
  });
  return {
    engine,
    presentation,
    worker,
    transport,
    frame: captureJournalFrame(engine.getSnapshot()),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("yields each bounded part, counts finish parts, reuses its worker and cleans ownership", async () => {
  const yieldTask = vi.fn(async () => {}),
    d = fixture({ yieldTask });
  d.frame.state.name = "x".repeat(20000);
  expect(await d.transport.run("database", { kind: "ensure" }, d.frame)).toEqual(result);
  const parts = d.worker.messages.filter((message) => message.type === "part");
  expect(yieldTask).toHaveBeenCalledTimes(parts.length);
  expect(d.worker.messages.at(-1)).toEqual({ type: "finish", id: 1, parts: parts.length });
  expect(parts.length).toBeGreaterThan(3);
  await d.transport.run("database", { kind: "ensure" }, d.frame);
  expect(d.worker.messages.at(-1)).toMatchObject({ id: 2 });
  expect(d.worker.onmessage).toBeNull();
  d.transport.dispose();
  d.transport.dispose();
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toThrow(
    "disposed",
  );
});
it("preserves business errors and allows a later real retry on the same worker", async () => {
  const d = fixture();
  d.worker.reply = "quota";
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toMatchObject({
    name: "QuotaExceededError",
    code: "QUOTA",
  });
  expect(d.worker.terminate).not.toHaveBeenCalled();
  d.worker.reply = "success";
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).resolves.toEqual(result);
  d.transport.dispose();
});

it("retires a worker which rejects a partial frame before its remaining replies can affect the next job", async () => {
  const d = fixture();
  d.worker.postMessage = (message) => {
    if (message.type === "part")
      d.worker.onmessage?.({
        data: { id: message.id, error: { name: "Error", message: "Invalid fragment order" } },
      } as MessageEvent);
  };
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toThrow(
    "Invalid fragment order",
  );
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  expect(d.worker.onmessage).toBeNull();
  d.transport.dispose();
});
it("rejects malformed replies, postMessage failures and worker startup failure honestly", async () => {
  const d = fixture();
  d.worker.reply = "malformed";
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toBeInstanceOf(
    JournalTransportError,
  );
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  d.worker.postMessage = () => {
    throw new DOMException("Cannot clone", "DataCloneError");
  };
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toThrow(
    "Cannot clone",
  );
  d.transport.dispose();
  const startup = new JournalTransport(d.presentation, {
    worker: () => {
      throw new Error("blocked");
    },
  });
  await expect(startup.run("database", { kind: "ensure" }, d.frame)).rejects.toThrow("blocked");
  startup.dispose();
  const sent = fixture();
  sent.worker.postMessage = (message) => {
    if (message.type === "finish") throw new Error("finish delivery unknown");
  };
  await expect(
    sent.transport.run("database", { kind: "ensure" }, sent.frame),
  ).rejects.toMatchObject({ uncertain: true });
  sent.transport.dispose();
});
it("stops chunk production on runtime failure and on dispose without leaked waiters", async () => {
  const d = fixture({
    yieldTask: (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
  });
  const task = d.transport.run("database", { kind: "ensure" }, d.frame);
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toThrow("active");
  const rejected = expect(task).rejects.toThrow("GPU unrelated worker error");
  d.worker.onerror?.({
    message: "GPU unrelated worker error",
    preventDefault: vi.fn(),
  } as unknown as ErrorEvent);
  await rejected;
  expect(d.worker.messages).toHaveLength(1);
  const second = d.transport.run("database", { kind: "ensure" }, d.frame);
  const closed = expect(second).rejects.toThrow("disposed");
  d.transport.dispose();
  await closed;
});
it("times out a lost response and rejects message decode failures", async () => {
  vi.useFakeTimers();
  const d = fixture({ timeout: 10 });
  d.worker.reply = "none";
  const task = d.transport.run("database", { kind: "ensure" }, d.frame),
    rejected = expect(task).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  const second = d.transport.run("database", { kind: "ensure" }, d.frame),
    decoded = expect(second).rejects.toThrow("decoded");
  d.worker.onmessageerror?.({} as MessageEvent);
  await decoded;
  d.transport.dispose();
});
it("yields while native input is pending before producing any fragment", async () => {
  const isInputPending = vi
    .fn()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true)
    .mockReturnValue(false);
  Object.defineProperty(navigator, "scheduling", { configurable: true, value: { isInputPending } });
  const yieldTask = vi.fn(async () => {}),
    d = fixture({ yieldTask });
  try {
    await d.transport.run("database", { kind: "ensure" }, d.frame);
    const count = d.worker.messages.filter((message) => message.type === "part").length;
    expect(yieldTask).toHaveBeenCalledTimes(count + 2);
    expect(isInputPending).toHaveBeenCalledWith({ includeContinuous: true });
  } finally {
    Reflect.deleteProperty(navigator, "scheduling");
    d.transport.dispose();
  }
});
it("waits behind newer live previews but explicit drain can force all accepted chunks", async () => {
  const d = fixture(),
    publisher = d.presentation.acquire();
  publisher.request({ projectId: d.frame.state.id, revision: d.frame.revision }, false);
  const task = d.transport.run("database", { kind: "ensure" }, d.frame);
  await Promise.resolve();
  await Promise.resolve();
  expect(d.worker.messages.map((message) => message.type)).toEqual(["begin"]);
  const release = d.transport.drain();
  await expect(task).resolves.toEqual(result);
  release();
  release();
  d.transport.dispose();
  publisher.release();
});

it("retains input-budget failures instead of converting them into main-thread compatibility fallback", async () => {
  const d = fixture();
  Object.assign(d.frame.state, {
    invalidInline: Object.fromEntries(
      Array.from({ length: 100 }, (_, id) => [id, "x".repeat(1000)]),
    ),
  });
  await expect(d.transport.run("database", { kind: "ensure" }, d.frame)).rejects.toBeInstanceOf(
    FragmentBudgetError,
  );
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  d.transport.dispose();
});
