import { expect, test } from "vitest";
import { virtualWindow } from "../../../../src/components/shared/scroll/virtual-window";

function covers(top: number, height: number, count: number, rowHeight: number, overscan: number) {
  const window = virtualWindow(top, height, count, rowHeight, overscan),
    total = count * rowHeight;
  expect(Number.isSafeInteger(window.first)).toBe(true);
  expect(Number.isSafeInteger(window.last)).toBe(true);
  expect(window.first).toBeGreaterThanOrEqual(0);
  expect(window.last).toBeGreaterThanOrEqual(window.first);
  expect(window.last).toBeLessThanOrEqual(count);
  expect(window.totalHeight).toBe(total);
  if (!count || !height) {
    expect(window.first).toBe(0);
    expect(window.last).toBe(0);
    return;
  }
  const actualTop = Math.max(0, Math.min(top, Math.max(0, total - height)));
  const visibleFirst = Math.floor(actualTop / rowHeight),
    visibleAfter = Math.min(count, Math.ceil((actualTop + height) / rowHeight));
  expect(window.first).toBeLessThanOrEqual(visibleFirst);
  expect(window.last).toBeGreaterThanOrEqual(visibleAfter);
  expect(window.last - window.first).toBeLessThanOrEqual(
    Math.min(count, Math.ceil(height / rowHeight) + Math.max(1, overscan) + 2 * overscan),
  );
}

test("keeps every fractional scroll in a bucket identical while covering its entire viewport", () => {
  const expected = virtualWindow(35 * 12, 220, 500, 35, 4);
  for (const top of [420, 420.001, 432.9, 455, 524.99, 559.999]) {
    expect(virtualWindow(top, 220, 500, 35, 4)).toEqual(expected);
    covers(top, 220, 500, 35, 4);
  }
  expect(virtualWindow(560, 220, 500, 35, 4)).not.toEqual(expected);
  expect(virtualWindow(3500, 220, 500, 35, 4)).toEqual({
    first: 96,
    last: 115,
    totalHeight: 17500,
  });
});

test("admits six blocks over twelve 48px wheel steps rather than ten row-by-row changes", () => {
  const legacy = (top: number) => {
    const visible = Math.ceil(220 / 24),
      first = Math.max(0, Math.min(500 - visible, Math.floor(top / 24)) - 4);
    return { first, last: Math.min(500, first + visible + 8) };
  };
  let before = virtualWindow(0, 220, 500, 24, 4),
    old = legacy(0),
    admissions = 0,
    oldAdmissions = 0;
  for (let index = 1; index <= 12; index++) {
    const top = index * 48,
      next = virtualWindow(top, 220, 500, 24, 4),
      previous = legacy(top);
    if (next.first !== before.first || next.last !== before.last) admissions++;
    if (previous.first !== old.first || previous.last !== old.last) oldAdmissions++;
    covers(top, 220, 500, 24, 4);
    before = next;
    old = previous;
  }
  expect(admissions).toBe(6);
  expect(oldAdmissions).toBe(10);
});

test("handles fast jumps, overscroll, the last partial row and fractional row sizes", () => {
  for (const count of [1, 3, 73, 1000])
    for (const rowHeight of [0.5, 23.75, 24, 35])
      for (const overscan of [0, 1, 4, 9])
        for (const height of [0, 0.25, 47.9, 220, 99999])
          for (const top of [-99, 0, 0.1, 48.01, 1001.25, 1e12])
            covers(top, height, count, rowHeight, overscan);
  expect(virtualWindow(1e12, 48.25, 73, 23.75, 4).last).toBe(73);
});

test("accepts a hidden initial viewport and recalculates resize and count shrink directly", () => {
  expect(virtualWindow(0, 0, 1000, 24)).toEqual({ first: 0, last: 0, totalHeight: 24000 });
  expect(virtualWindow(9999, 220, 0, 24)).toEqual({ first: 0, last: 0, totalHeight: 0 });
  const large = virtualWindow(576, 220, 500, 24);
  covers(576, 97.5, 500, 24, 4);
  expect(virtualWindow(576, 97.5, 500, 24).last).toBeLessThan(large.last);
  expect(virtualWindow(9999, 220, 3, 24)).toEqual({ first: 0, last: 3, totalHeight: 72 });
  covers(9999, 48, 3, 24, 4);
  covers(9999, 48, 1000, 24, 4);
});

test("overscan zero still covers partial boundary rows without fractional re-admission", () => {
  const whole = virtualWindow(24, 48, 500, 24, 0);
  expect(whole).toEqual({ first: 1, last: 4, totalHeight: 12000 });
  expect(virtualWindow(47.999, 48, 500, 24, 0)).toEqual(whole);
  covers(47.999, 48, 500, 24, 0);
});

test("computes billion-row windows without allocating a row collection", () => {
  const window = virtualWindow(24 * 999999970 + 0.25, 220, 1e9, 24, 4);
  expect(window.totalHeight).toBe(24e9);
  expect(window.last - window.first).toBeLessThanOrEqual(22);
  covers(24 * 999999970 + 0.25, 220, 1e9, 24, 4);
  const extreme = virtualWindow(Number.MAX_VALUE, 35, Number.MAX_SAFE_INTEGER, 35, 0);
  expect(extreme.last).toBe(Number.MAX_SAFE_INTEGER);
  expect(extreme.first).toBe(Number.MAX_SAFE_INTEGER - 1);
  expect(extreme.last - extreme.first).toBeLessThanOrEqual(2);
});

test("rejects invalid metrics rather than returning NaN or unsafe indices", () => {
  for (const args of [
    [NaN, 220, 500, 24, 4],
    [Infinity, 220, 500, 24, 4],
    [0, -1, 500, 24, 4],
    [0, NaN, 500, 24, 4],
    [0, 220, -1, 24, 4],
    [0, 220, 1.5, 24, 4],
    [0, 220, Number.MAX_SAFE_INTEGER + 1, 24, 4],
    [0, 220, 500, 0, 4],
    [0, 220, 500, Infinity, 4],
    [0, 220, 500, 24, -1],
    [0, 220, 500, 24, 1.5],
    [0, 220, 500, 24, Infinity],
    [0, 220, 500, Number.MAX_VALUE, 4],
  ])
    expect(() => virtualWindow(...(args as [number, number, number, number, number]))).toThrow(
      RangeError,
    );
});
