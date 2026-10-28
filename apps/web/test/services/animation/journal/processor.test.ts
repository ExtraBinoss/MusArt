import { expect, it, vi } from "vitest";
import { evaluateReplay } from "@musart/core";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { HistoryStore } from "../../../../src/services/history/store";
import { JournalProcessor } from "../../../../src/services/animation/journal/processor";
import { frameAt, commitAt } from "./fixtures";
import { eventAt, projectAt } from "../../history/fixtures";

async function fixture() {
  const name = crypto.randomUUID(),
    processor = new JournalProcessor(name),
    initial = await processor.run({ kind: "ensure" }, frameAt()),
    db = await openStudioDatabase(name),
    store = new HistoryStore(async () => db);
  return {
    name,
    processor,
    initial,
    db,
    store,
    async close() {
      await processor.dispose();
      db.close();
    },
  };
}
it("prepares summary deltas, immutable snapshots and exact headers entirely at its owned boundary", async () => {
  const d = await fixture();
  try {
    const frame = frameAt(1),
      job = d.processor.run(commitAt(d.initial.meta.epoch!, 1), frame);
    frame.state.pages[0]!.layers[0]!.x = 999;
    const result = await job;
    expect(result).toMatchObject({ ownNext: 1, meta: { count: 1 } });
    expect(JSON.stringify(result)).not.toContain('"pages"');
    const entry = await d.db.get("journalEvents", ["history-project", 0]);
    expect(entry!.event.after).toBeUndefined();
    expect(entry!.event.commands).toEqual([{ type: "updateLayers", summary: true }]);
    const replay = await d.store.replay("history-project");
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(1);
    const restarted = new JournalProcessor(d.name);
    try {
      await restarted.run(commitAt(d.initial.meta.epoch!, 2), frameAt(2));
      expect((await d.db.get("journalEvents", ["history-project", 1]))!.event.after).toBeDefined();
      const retry = await restarted.run(
        {
          ...commitAt(d.initial.meta.epoch!, 2),
          operation: { ...commitAt(d.initial.meta.epoch!, 2).operation, retry: true },
        },
        frameAt(2),
      );
      expect(retry.ownNext).toBe(2);
      expect(retry.meta.count).toBe(2);
    } finally {
      await restarted.dispose();
    }
  } finally {
    await d.close();
  }
});
it("clears recoverably and never adopts remote cursor advances from repeated clear acknowledgments", async () => {
  const d = await fixture();
  try {
    await d.processor.run(commitAt(d.initial.meta.epoch!, 1), frameAt(1));
    const action = {
      kind: "clear" as const,
      operation: { id: "clear-action", epoch: d.initial.meta.epoch! },
    };
    const cleared = await d.processor.run(action, frameAt(1));
    expect(cleared.ownNext).toBe(0);
    await d.store.append("history-project", eventAt(2), {}, projectAt(2).updatedAt);
    const retry = await d.processor.run(action, frameAt(1));
    expect(retry).toMatchObject({ ownNext: 0, meta: { count: 1, next: 1 } });
    await d.processor.run(commitAt(cleared.meta.epoch!, 3, 0), frameAt(3));
    const replay = await d.store.replay("history-project");
    expect(replay.events).toHaveLength(2);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(3);
  } finally {
    await d.close();
  }
});
it("resumes recording with one idempotent checkpoint and preserves later remote events on a lost ACK", async () => {
  const d = await fixture();
  try {
    const disabled = await d.processor.run(
      {
        kind: "configure",
        operation: { id: "disabled", epoch: d.initial.meta.epoch! },
        options: { enabled: false },
        ownNext: 0,
      },
      frameAt(),
    );
    await d.processor.run(commitAt(disabled.meta.epoch!, 1, 0), frameAt(1));
    const enable = {
      kind: "configure" as const,
      operation: { id: "enabled", epoch: disabled.meta.epoch!, configurationId: "disabled" },
      options: { enabled: true },
      ownNext: 0,
    };
    const enabled = await d.processor.run(enable, frameAt(1));
    expect(enabled).toMatchObject({ ownNext: 1, meta: { count: 1 } });
    await d.store.append("history-project", eventAt(2), {}, projectAt(2).updatedAt);
    const retry = await d.processor.run(enable, frameAt(1));
    expect(retry).toMatchObject({ ownNext: 1, meta: { count: 2 } });
    expect((await d.db.get("journalEvents", ["history-project", 0]))!.operationId).toBe("enabled");
  } finally {
    await d.close();
  }
});
it("retries a configure/checkpoint boundary failure without duplication and rejects an ambiguous intervening writer", async () => {
  const d = await fixture();
  try {
    const disabled = await d.processor.run(
      {
        kind: "configure",
        operation: { id: "off", epoch: d.initial.meta.epoch! },
        options: { enabled: false },
        ownNext: 0,
      },
      frameAt(),
    );
    const enable = {
      kind: "configure" as const,
      operation: { id: "on", epoch: disabled.meta.epoch!, configurationId: "off" },
      options: { enabled: true },
      ownNext: 0,
    };
    const fail = vi
      .spyOn(HistoryStore.prototype, "appendOperation")
      .mockRejectedValueOnce(Error("interrupted before checkpoint"));
    await expect(d.processor.run(enable, frameAt(1))).rejects.toThrow("interrupted");
    fail.mockRestore();
    expect((await d.processor.run(enable, frameAt(1))).ownNext).toBe(1);
    await d.processor.run(
      {
        kind: "configure",
        operation: { id: "off-again", epoch: "on", configurationId: "on" },
        options: { enabled: false },
        ownNext: 1,
      },
      frameAt(1),
    );
    const again = {
      ...enable,
      operation: { id: "on-again", epoch: "off-again", configurationId: "off-again" },
      ownNext: 1,
    };
    const failAgain = vi
      .spyOn(HistoryStore.prototype, "appendOperation")
      .mockRejectedValueOnce(Error("interrupted"));
    await expect(d.processor.run(again, frameAt(2))).rejects.toThrow("interrupted");
    failAgain.mockRestore();
    await d.store.append("history-project", eventAt(3), {}, projectAt(3).updatedAt);
    await expect(d.processor.run(again, frameAt(2))).rejects.toMatchObject({
      code: "STALE_HISTORY_OPERATION",
    });
    expect((await d.store.info("history-project"))!.count).toBe(2);
  } finally {
    await d.close();
  }
});
it("drains admitted work, rejects malformed jobs and disposes its connection without retaining a reusable processor", async () => {
  const processor = new JournalProcessor(crypto.randomUUID());
  const first = processor.run({ kind: "ensure" }, frameAt()),
    closing = processor.dispose();
  await first;
  await closing;
  await expect(processor.run({ kind: "ensure" }, frameAt())).rejects.toThrow("disposed");
  expect(processor.dispose()).toBe(closing);
  expect(() => new JournalProcessor("")).toThrow("database");
  const d = await fixture();
  try {
    await expect(
      d.processor.run({ ...commitAt(d.initial.meta.epoch!, 1), at: NaN }, frameAt(1)),
    ).rejects.toThrow("commit");
    await expect(
      d.processor.run(
        { ...commitAt(d.initial.meta.epoch!, 1), types: ["fakeCommand"] },
        frameAt(1),
      ),
    ).rejects.toThrow("commit");
    await d.processor.run(commitAt(d.initial.meta.epoch!, 1), frameAt(1));
    expect((await d.db.get("journalEvents", ["history-project", 0]))!.event.after).toBeDefined();
    await expect(
      d.processor.run(
        {
          kind: "configure",
          operation: { id: "bad", epoch: d.initial.meta.epoch! },
          options: {},
          ownNext: -1,
        },
        frameAt(),
      ),
    ).rejects.toThrow("cursor");
    await expect(
      d.processor.run({ kind: "ensure" }, { ...frameAt(), pageId: "missing" }),
    ).rejects.toThrow("frame");
  } finally {
    await d.close();
  }
});
it("rejects a superseding control between configure and header acknowledgment instead of adopting its epoch", async () => {
  const d = await fixture();
  try {
    const configure = HistoryStore.prototype.configure;
    const spy = vi.spyOn(HistoryStore.prototype, "configure").mockImplementation(async function (
      this: HistoryStore,
      ...args: Parameters<HistoryStore["configure"]>
    ) {
      await configure.apply(this, args);
      const meta = (await d.db.get("journalMeta", "history-project"))!;
      await d.db.put("journalMeta", {
        ...meta,
        configurationId: "remote-config",
        epoch: "remote-epoch",
      });
    });
    await expect(
      d.processor.run(
        {
          kind: "configure",
          operation: { id: "own-config", epoch: d.initial.meta.epoch! },
          options: { limit: 20 },
          ownNext: 0,
        },
        frameAt(),
      ),
    ).rejects.toMatchObject({ code: "STALE_HISTORY_OPERATION" });
    expect((await d.store.info("history-project"))!.epoch).toBe("remote-epoch");
    expect(await d.db.count("journalEvents")).toBe(0);
    spy.mockRestore();
  } finally {
    await d.close();
  }
});
it("metadata-only configuration cannot adopt an unpersisted failed frame as the next delta baseline", async () => {
  const d = await fixture();
  try {
    const failed = frameAt(1),
      fail = vi
        .spyOn(HistoryStore.prototype, "appendOperation")
        .mockRejectedValueOnce(Error("append failed"));
    await expect(d.processor.run(commitAt(d.initial.meta.epoch!, 1), failed)).rejects.toThrow(
      "append failed",
    );
    fail.mockRestore();
    await d.processor.run(
      {
        kind: "configure",
        operation: { id: "limit-after-failure", epoch: d.initial.meta.epoch! },
        options: { limit: 20 },
        ownNext: 0,
      },
      failed,
    );
    const final = frameAt(1);
    final.revision = 2;
    final.state.pages[0]!.layers[0]!.y = 77;
    await d.processor.run(commitAt(d.initial.meta.epoch!, 2, 0), final);
    const replay = await d.store.replay("history-project"),
      layer = evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!;
    expect({ x: layer.x, y: layer.y }).toEqual({ x: 1, y: 77 });
    expect(replay.events[0]!.after).toBeDefined();
  } finally {
    await d.close();
  }
});
it("a foreign reset with the same numeric cursor cannot revalidate an older metadata mirror", async () => {
  const d = await fixture();
  try {
    const reset = await d.store.clear(projectAt(8), "page");
    await d.processor.run(
      {
        kind: "configure",
        operation: { id: "after-foreign-reset", epoch: reset.epoch! },
        options: { limit: 20 },
        ownNext: 0,
      },
      frameAt(),
    );
    const final = frameAt();
    final.revision = 1;
    final.state.pages[0]!.layers[0]!.y = 77;
    await d.processor.run(commitAt(reset.epoch!, 1, 0), final);
    const replay = await d.store.replay("history-project"),
      layer = evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!;
    expect({ x: layer.x, y: layer.y }).toEqual({ x: 0, y: 77 });
    expect(replay.events[0]!.after).toBeDefined();
  } finally {
    await d.close();
  }
});
