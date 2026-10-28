import { expect, test, vi } from "vitest";
import {
  DEFAULT_GUIDE_COLOR,
  GUIDE_COLOR_KEY,
  GuideColors,
  guideColors,
} from "../../../src/state/guides/colors";

test("validates persisted choices and keeps the last successful color when storage is unavailable", () => {
  const storage = { getItem: vi.fn((): string | null => null), setItem: vi.fn() };
  const preferences = new GuideColors(() => storage);
  expect(preferences.read()).toBe(DEFAULT_GUIDE_COLOR);
  storage.getItem.mockReturnValue("#00AAFF");
  expect(preferences.read()).toBe("#00aaff");
  storage.getItem.mockReturnValue("not-a-color");
  expect(preferences.read()).toBe("#00aaff");
  preferences.remember("#ABC");
  expect(storage.setItem).toHaveBeenCalledWith(GUIDE_COLOR_KEY, "#abc");
  storage.getItem.mockImplementation(() => {
    throw new Error("disabled");
  });
  storage.setItem.mockImplementation(() => {
    throw new Error("disabled");
  });
  preferences.remember("#123456");
  expect(preferences.read()).toBe("#123456");
  for (const bad of ["transparent", "#12345678", "url(x)", "red"])
    expect(() => preferences.remember(bad)).toThrow();
  expect(
    new GuideColors(() => {
      throw new Error("denied");
    }).read(),
  ).toBe(DEFAULT_GUIDE_COLOR);
});
test("the shared user preference uses browser storage without retaining document state", () => {
  localStorage.removeItem(GUIDE_COLOR_KEY);
  guideColors.remember("#336699");
  expect(guideColors.read()).toBe("#336699");
  expect(localStorage.getItem(GUIDE_COLOR_KEY)).toBe("#336699");
  localStorage.removeItem(GUIDE_COLOR_KEY);
});
