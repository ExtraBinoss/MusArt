import { expect, test, vi } from "vitest";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  ONBOARDING_STORAGE_KEY,
} from "../../../src/state/onboarding/preferences";

test("only a validated completion record finishes onboarding", () => {
  const getItem = vi.fn();
  const storage = () => ({ getItem, setItem: vi.fn() });
  for (const value of [
    null,
    "{",
    "null",
    "[]",
    '{"version":2,"completed":true}',
    '{"version":1,"completed":"true"}',
    " ".repeat(129),
  ]) {
    getItem.mockReturnValue(value);
    expect(hasCompletedOnboarding(storage)).toBe(false);
  }
  getItem.mockReturnValue('{"version":1,"completed":true}');
  expect(hasCompletedOnboarding(storage)).toBe(true);
  expect(getItem).toHaveBeenLastCalledWith(ONBOARDING_STORAGE_KEY);
});

test("records completion separately from projects and reports storage failures", () => {
  const setItem = vi.fn();
  expect(completeOnboarding(() => ({ setItem, getItem: vi.fn() }))).toBe(true);
  expect(setItem).toHaveBeenCalledExactlyOnceWith(
    ONBOARDING_STORAGE_KEY,
    '{"version":1,"completed":true}',
  );
  const unavailable = () => {
    throw new Error("Blocked storage");
  };
  expect(hasCompletedOnboarding(unavailable)).toBe(false);
  expect(completeOnboarding(unavailable)).toBe(false);
  expect(completeOnboarding(() => ({ getItem: vi.fn(), setItem: unavailable }))).toBe(false);
});
