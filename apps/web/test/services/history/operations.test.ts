import { expect, it, vi } from "vitest";
import { stateFromProject } from "@musart/core";
import { fixture, projectAt, eventAt } from "./fixtures";
import { HistoryStore } from "../../../src/services/history/store";
import { eventBytes } from "../../../src/services/history/accounting";
import {
  StaleHistoryOperationError,
  type HistoryOperation,
} from "../../../src/services/history/operations";
import { retireProject } from "../../../src/services/projects/lifecycle";

async function operationFixture() {
  const d = await fixture(),
    meta = (await d.store.info("history-project"))!;
  const operation: HistoryOperation = {
    id: "operation-1",
    epoch: meta.epoch!,
    expectedNext: 0,
    retry: false,
  };
  function append(operation: HistoryOperation, index = 1, store = d.store) {
    const project = projectAt(index);
    return store.appendOperation(
      project.id,
      eventAt(index),
      {},
      project.updatedAt,
      1000,
      { expectedNext: operation.expectedNext, current: stateFromProject(project) },
      operation,
    );
  }
  return { ...d, operation, append };
}
it("acknowledges lost/repeated responses by the unique operation key without rewriting payloads, counters, retention or timestamps", async () => {
  const d = await operationFixture();
  try {
    const first = await d.append(d.operation);
    expect(first).toMatchObject({ ownNext: 1, replayed: false, meta: { count: 1, next: 1 } });
    const before = await d.store.info("history-project"),
      record = await d.db.get("journalEvents", ["history-project", 0]);
    expect(record!.operationId).toBe(d.operation.id);
    expect(before!.bytes!.events).toBe(eventBytes(record!));
    const put = vi.spyOn(IDBObjectStore.prototype, "put"),
      cursor = vi.spyOn(IDBObjectStore.prototype, "openCursor"),
      all = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const retry = await d.append({ ...d.operation, retry: true }, 999);
    expect(retry).toEqual({ meta: before, ownNext: 1, replayed: true });
    expect(put).not.toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
    expect(await d.db.get("journalEvents", ["history-project", 0])).toEqual(record);
  } finally {
    d.db.close();
  }
});
it("serializes simultaneous same-ID writes across sessions and returns the original own sequence after later remote commits", async () => {
  const d = await operationFixture();
  try {
    const other = new HistoryStore(async () => d.db);
    const results = await Promise.all([d.append(d.operation), d.append(d.operation, 1, other)]);
    expect(
      results.map((result) => result.replayed).sort((left, right) => Number(left) - Number(right)),
    ).toEqual([false, true]);
    expect((await d.store.info("history-project"))!.count).toBe(1);
    await d.append({ ...d.operation, id: "remote", expectedNext: 1 }, 2, other);
    const ack = await d.append({ ...d.operation, retry: true });
    expect(ack).toMatchObject({ ownNext: 1, replayed: true, meta: { next: 2, count: 2 } });
  } finally {
    d.db.close();
  }
});
it("accepts a divergent first attempt as a checkpoint but rejects an ambiguous absent retry without changing the header", async () => {
  const d = await operationFixture();
  try {
    await d.append(d.operation);
    const first = await d.append({ ...d.operation, id: "divergent" }, 8);
    expect(first).toMatchObject({ ownNext: 2, replayed: false });
    const record = await d.db.get("journalEvents", ["history-project", 1]);
    expect(record!.event.delta).toEqual([]);
    expect(record!.event.after!.pages[0]!.layers[0]!.x).toBe(8);
    const before = await d.store.info("history-project");
    await expect(
      d.append({ ...d.operation, id: "missing-ack", retry: true }, 9),
    ).rejects.toBeInstanceOf(StaleHistoryOperationError);
    expect(await d.store.info("history-project")).toEqual(before);
    expect(await d.db.count("journalEvents")).toBe(2);
  } finally {
    d.db.close();
  }
});
it("rejects missing pruned IDs and reset epochs rather than appending an old operation again", async () => {
  const d = await operationFixture();
  try {
    await d.store.configure("history-project", { limit: 10 });
    for (let index = 0; index < 12; index++)
      await d.append({ ...d.operation, id: `event-${index}`, expectedNext: index }, index + 1);
    expect(await d.db.get("journalEvents", ["history-project", 0])).toBeUndefined();
    await expect(d.append({ ...d.operation, id: "event-0", retry: true })).rejects.toBeInstanceOf(
      StaleHistoryOperationError,
    );
    const reset = await d.store.clear(projectAt(12), "page");
    expect(reset.epoch).not.toBe(d.operation.epoch);
    await expect(d.append({ ...d.operation, id: "old-epoch" })).rejects.toBeInstanceOf(
      StaleHistoryOperationError,
    );
    expect((await d.store.info("history-project"))!.count).toBe(0);
  } finally {
    d.db.close();
  }
});
it("allows an unacknowledged operation to retry only at its original unchanged cursor and recording epoch", async () => {
  const d = await operationFixture();
  try {
    const retry = await d.append({ ...d.operation, retry: true });
    expect(retry).toMatchObject({ ownNext: 1, replayed: false });
    await d.store.configure("history-project", { enabled: false });
    const disabled = (await d.store.info("history-project"))!;
    const skipped = { ...d.operation, id: "disabled", epoch: disabled.epoch!, expectedNext: 1 };
    expect(await d.append(skipped)).toMatchObject({
      ownNext: 1,
      replayed: false,
      meta: { count: 1 },
    });
    expect(await d.append({ ...skipped, retry: true })).toMatchObject({
      ownNext: 1,
      meta: { count: 1 },
    });
    await d.store.configure("history-project", { enabled: true });
    await expect(d.append({ ...skipped, retry: true })).rejects.toBeInstanceOf(
      StaleHistoryOperationError,
    );
  } finally {
    d.db.close();
  }
});
it("rejects tombstoned or uninitialized projects, malformed operations and rollbacks, leaving no dedup acknowledgment", async () => {
  const d = await operationFixture();
  try {
    for (const patch of [
      { id: "" },
      { id: "x".repeat(129) },
      { epoch: "" },
      { expectedNext: -1 },
      { expectedNext: 1.5 },
    ])
      await expect(d.append({ ...d.operation, ...patch })).rejects.toThrow(
        "Invalid history operation",
      );
    const put = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "journalMeta") throw Error("metadata quota");
      return put.apply(this, args);
    });
    await expect(d.append(d.operation)).rejects.toThrow("metadata quota");
    failure.mockRestore();
    expect(await d.db.count("journalEvents")).toBe(0);
    expect((await d.append({ ...d.operation, retry: true })).replayed).toBe(false);
    const tx = d.db.transaction(["preferences"], "readwrite");
    await retireProject(tx.objectStore("preferences"), "history-project");
    await tx.done;
    await expect(d.append({ ...d.operation, retry: true })).rejects.toThrow("deleted");
  } finally {
    d.db.close();
  }
});
it("replays a successful clear acknowledgment without deleting a later writer's entries, but rejects a superseding reset", async () => {
  const d = await operationFixture();
  try {
    await d.append(d.operation);
    const control = { id: "clear-once", epoch: d.operation.epoch };
    const cleared = await d.store.clear(projectAt(1), "page", control);
    expect(cleared.epoch).toBe(control.id);
    await d.append(
      { ...d.operation, id: "after-clear", epoch: cleared.epoch!, expectedNext: 0 },
      2,
    );
    const before = await d.store.info("history-project");
    expect(await d.store.clear(projectAt(1), "page", control)).toEqual(before);
    expect(await d.db.count("journalEvents")).toBe(1);
    await d.store.clear(projectAt(2), "page");
    await expect(d.store.clear(projectAt(1), "page", control)).rejects.toBeInstanceOf(
      StaleHistoryOperationError,
    );
  } finally {
    d.db.close();
  }
});
it("configuration retries preserve newer appended entries and cannot overwrite a superseding configuration or clear", async () => {
  const d = await operationFixture();
  try {
    const control = { id: "limit-once", epoch: d.operation.epoch };
    await d.store.configure("history-project", { limit: 20 }, control);
    await d.append(d.operation);
    const before = await d.store.info("history-project");
    await d.store.configure("history-project", { limit: 20 }, control);
    expect(await d.store.info("history-project")).toEqual(before);
    await d.store.configure(
      "history-project",
      { limit: 30 },
      { id: "other-limit", epoch: d.operation.epoch, configurationId: control.id },
    );
    await expect(
      d.store.configure("history-project", { limit: 20 }, control),
    ).rejects.toBeInstanceOf(StaleHistoryOperationError);
    const current = (await d.store.info("history-project"))!;
    const disable = {
      id: "disable-once",
      epoch: current.epoch!,
      configurationId: current.configurationId,
    };
    await d.store.configure("history-project", { enabled: false }, disable);
    const disabled = await d.store.info("history-project");
    expect(disabled!.epoch).toBe(disable.id);
    await d.store.configure("history-project", { enabled: false }, disable);
    expect(await d.store.info("history-project")).toEqual(disabled);
    await d.store.clear(projectAt(1), "page");
    await expect(
      d.store.configure("history-project", { enabled: false }, disable),
    ).rejects.toBeInstanceOf(StaleHistoryOperationError);
  } finally {
    d.db.close();
  }
});
it("rejects malformed control identities without corrupting epochs and keeps missing journals explicit", async () => {
  const d = await operationFixture();
  try {
    const before = await d.store.info("history-project");
    for (const patch of [
      { id: "" },
      { id: "x".repeat(129) },
      { epoch: "" },
      { epoch: "x".repeat(129) },
      { configurationId: "" },
      { configurationId: "x".repeat(129) },
    ]) {
      const invalid = { id: "control", epoch: d.operation.epoch, ...patch };
      await expect(d.store.clear(projectAt(), "page", invalid)).rejects.toThrow(
        "Invalid history operation",
      );
      await expect(d.store.configure("history-project", { limit: 20 }, invalid)).rejects.toThrow(
        "Invalid history operation",
      );
    }
    expect(await d.store.info("history-project")).toEqual(before);
    expect(await d.store.databaseName()).toBe(d.db.name);
    await d.db.delete("journalMeta", "history-project");
    await expect(d.append(d.operation)).rejects.toBeInstanceOf(StaleHistoryOperationError);
  } finally {
    d.db.close();
  }
});
it("keeps operation identity scoped to its project and rejects unsupported epoch lengths", async () => {
  const d = await operationFixture();
  try {
    const second = { ...projectAt(), id: "second-project" };
    const meta = await d.store.ensure(second, "page");
    await d.append(d.operation);
    const event = { ...eventAt(1), projectId: second.id };
    const result = await d.store.appendOperation(
      second.id,
      event,
      {},
      second.updatedAt,
      1,
      { expectedNext: 0, current: stateFromProject(second) },
      { ...d.operation, epoch: meta.epoch! },
    );
    expect(result).toMatchObject({ ownNext: 1, replayed: false, meta: { projectId: second.id } });
    await expect(
      d.append({ ...d.operation, id: "bad-epoch", epoch: "x".repeat(129) }),
    ).rejects.toThrow("Invalid history operation");
    expect(await d.db.count("journalEvents")).toBe(2);
  } finally {
    d.db.close();
  }
});
it("retirement takes precedence over clear/configuration acknowledgments and initialization", async () => {
  const d = await operationFixture();
  try {
    const config = { id: "config-accepted", epoch: d.operation.epoch };
    await d.store.configure("history-project", { limit: 20 }, config);
    const clear = { id: "clear-accepted", epoch: d.operation.epoch };
    await d.store.clear(projectAt(), "page", clear);
    const tx = d.db.transaction("preferences", "readwrite");
    await retireProject(tx.store, "history-project");
    await tx.done;
    await expect(d.store.clear(projectAt(), "page", clear)).rejects.toThrow("deleted");
    await expect(d.store.configure("history-project", { limit: 20 }, config)).rejects.toThrow(
      "deleted",
    );
    await expect(d.store.ensure(projectAt(), "page")).rejects.toThrow("deleted");
    expect((await d.store.info("history-project"))!.epoch).toBe(clear.id);
  } finally {
    d.db.close();
  }
});
it("failed clear and configuration transactions leave their identities retryable without partial effects", async () => {
  const d = await operationFixture();
  try {
    await d.append(d.operation);
    const control = { id: "clear-retry", epoch: d.operation.epoch };
    const before = await d.store.info("history-project"),
      put = IDBObjectStore.prototype.put;
    let failedStore = "journalBase";
    const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === failedStore) throw Error("quota");
      return put.apply(this, args);
    });
    await expect(d.store.clear(projectAt(1), "page", control)).rejects.toThrow("quota");
    expect(await d.store.info("history-project")).toEqual(before);
    expect(await d.db.count("journalEvents")).toBe(1);
    failedStore = "none";
    const cleared = await d.store.clear(projectAt(1), "page", control);
    const config = {
      id: "configure-retry",
      epoch: cleared.epoch!,
      configurationId: cleared.configurationId,
    };
    failedStore = "journalMeta";
    await expect(d.store.configure("history-project", { limit: 20 }, config)).rejects.toThrow(
      "quota",
    );
    expect(await d.store.info("history-project")).toEqual(cleared);
    failedStore = "none";
    await d.store.configure("history-project", { limit: 20 }, config);
    expect(await d.store.info("history-project")).toMatchObject({
      limit: 20,
      configurationId: config.id,
    });
    failure.mockRestore();
  } finally {
    d.db.close();
  }
});
