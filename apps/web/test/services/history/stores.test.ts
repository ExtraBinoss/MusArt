import { expect, it } from "vitest";
import { HISTORY_STORES, HISTORY_WRITE_STORES } from "../../../src/services/history/stores";

it("keeps replay reads independent from the retirement metadata lock used by every journal write", () => {
  expect(HISTORY_STORES).toEqual(["journalMeta", "journalBase", "journalEvents", "journalAssets"]);
  expect(HISTORY_WRITE_STORES).toEqual([...HISTORY_STORES, "preferences"]);
  expect(new Set(HISTORY_WRITE_STORES).size).toBe(5);
});
