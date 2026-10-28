import { expect, it } from "vitest";
import {
  hexToHsva,
  hsvaToHex,
  normalizeHex,
} from "../../../../src/components/properties/color/conversion";
it("normalizes all portable hex formats without losing alpha or accepting arbitrary CSS", () => {
  expect(normalizeHex("#aBc")).toBe("#aabbcc");
  expect(normalizeHex("#abcd")).toBe("#aabbccdd");
  expect(normalizeHex("#AABBCCff")).toBe("#aabbcc");
  expect(normalizeHex("transparent")).toBe("#00000000");
  expect(normalizeHex("TRANSPARENT")).toBe("#00000000");
  for (const value of ["red", "#12", "#zzzzzz", "#1234567", "rgba(0,0,0,0)"])
    expect(normalizeHex(value)).toBeNull();
  expect(() => hexToHsva("invalid")).toThrow("Unsupported");
});
it("round-trips byte-exact RGB/alpha across hue sectors, gray, black and white", () => {
  for (const hex of [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#ff00ff",
    "#3366ff80",
    "#c0c0c0",
    "#00000000",
    "#152dff01",
    "#fafafffe",
  ])
    expect(hsvaToHex(hexToHsva(hex)), hex).toBe(hex);
  expect(hexToHsva("#0000ff")).toEqual({ h: 240, s: 100, v: 100, a: 1 });
  expect(hsvaToHex({ h: 360, s: 110, v: 150, a: 2 })).toBe("#ff0000");
  expect(hsvaToHex({ h: -120, s: 100, v: 100, a: -1 })).toBe("#0000ff00");
  expect(() => hsvaToHex({ h: NaN, s: 100, v: 100, a: 1 })).toThrow("finite");
});
