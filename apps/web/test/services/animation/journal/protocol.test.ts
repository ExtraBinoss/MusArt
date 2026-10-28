import { expect, it } from "vitest";
import {
  journalFailure,
  journalResponse,
  JournalTransportError,
} from "../../../../src/services/animation/journal/protocol";
const result = {
  ownNext: 2,
  meta: {
    version: 1,
    projectId: "project",
    epoch: "epoch",
    first: 0,
    next: 3,
    count: 3,
    limit: 10000,
    enabled: true,
    lastAt: 0,
    lastStamp: "stamp",
  },
};
it("accepts a small header with an independent own cursor and preserves real error codes", () => {
  expect(journalResponse({ id: 1, result }, 1)).toEqual({ id: 1, result });
  const failure = {
    name: "StaleHistoryOperationError",
    message: "stale",
    code: "STALE_HISTORY_OPERATION",
  };
  expect(journalResponse({ id: 1, error: failure }, 1)).toEqual({ id: 1, error: failure });
  expect(journalFailure(failure)).toMatchObject(failure);
  expect(journalFailure({ name: "Error", message: "quota" })).toMatchObject({
    name: "Error",
    message: "quota",
  });
});
it("rejects stale IDs and malformed results instead of simulating successful saving", () => {
  for (const value of [
    null,
    {},
    { id: 2, result },
    { id: 1, error: { name: "Error" } },
    { id: 1, result: { ...result, ownNext: -1 } },
    { id: 1, result: { ...result, ownNext: 4 } },
    { id: 1, result: { ...result, meta: { ...result.meta, count: NaN } } },
  ])
    expect(() => journalResponse(value, 1)).toThrow(JournalTransportError);
  for (const patch of [
    { epoch: "" },
    { epoch: undefined },
    { first: 4 },
    { count: 1 },
    { limit: 0 },
    { projectId: "x".repeat(129) },
    { configurationId: "" },
    { lastAt: Infinity },
  ])
    expect(() =>
      journalResponse({ id: 1, result: { ...result, meta: { ...result.meta, ...patch } } }, 1),
    ).toThrow(JournalTransportError);
});
