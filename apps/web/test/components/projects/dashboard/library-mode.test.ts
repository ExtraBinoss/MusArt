import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  LIBRARY_MODE_KEY,
  readLibraryMode,
  useLibraryMode,
  projectLibraryMode,
} from "../../../../src/components/projects/dashboard/library-mode";
import { projectSummary } from "../../../support/projects";
beforeEach(() => localStorage.removeItem(LIBRARY_MODE_KEY));
afterEach(() => vi.restoreAllMocks());
test("missing, invalid and unavailable user preferences resolve to All", () => {
  expect(readLibraryMode()).toBe("all");
  localStorage.setItem(LIBRARY_MODE_KEY, "invalid");
  expect(readLibraryMode()).toBe("all");
  for (const mode of ["all", "static", "motion"] as const) {
    localStorage.setItem(LIBRARY_MODE_KEY, mode);
    expect(readLibraryMode()).toBe(mode);
  }
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  expect(readLibraryMode()).toBe("all");
});
test("blocked persistence keeps the selected filter usable without changing project data", () => {
  const hook = renderHook(() => useLibraryMode());
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  act(() => hook.result.current[1]("motion"));
  expect(hook.result.current[0]).toBe("motion");
  expect(localStorage.getItem(LIBRARY_MODE_KEY)).toBeNull();
  hook.unmount();
});
test("uses canonical project mode and derives Motion from legacy artboard metadata", () => {
  const legacy = projectSummary();
  expect(projectLibraryMode(legacy)).toBe("static");
  expect(projectLibraryMode({ ...legacy, mode: "motion" })).toBe("motion");
  legacy.pages[1]!.mode = "motion";
  expect(projectLibraryMode(legacy)).toBe("motion");
});
