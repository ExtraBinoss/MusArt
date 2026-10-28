import { expect, it } from "vitest";
import {
  DEFAULT_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  HISTORY_PAGE_SIZE,
} from "../../../src/services/history/model";
it("defaults to 10,000 entries with bounded pagination and adjustable capacity", () => {
  expect(DEFAULT_HISTORY_LIMIT).toBe(10000);
  expect(HISTORY_PAGE_SIZE).toBe(100);
  expect(MIN_HISTORY_LIMIT).toBeLessThan(DEFAULT_HISTORY_LIMIT);
  expect(MAX_HISTORY_LIMIT).toBeGreaterThan(DEFAULT_HISTORY_LIMIT);
});
