import { afterEach, expect, test, vi } from "vitest";
import { FONT_CATALOG } from "@musart/assets";
import {
  readRecentFonts,
  rememberFont,
  resolveFont,
} from "../../../../src/components/properties/fonts/catalog";
const key = "musart.fonts.recent";
afterEach(() => {
  localStorage.removeItem(key);
  vi.restoreAllMocks();
});

test("resolves actual bundled families and legacy aliases consistently", () => {
  for (const family of FONT_CATALOG) expect(resolveFont(family.family)).toEqual(family);
  for (const family of FONT_CATALOG) expect(resolveFont(family.id)).toEqual(family);
  expect(resolveFont("'Space   Grotesk'")).toEqual(resolveFont("Space Grotesk"));
  expect(resolveFont(' "Arial" ')).toEqual(resolveFont("Arimo"));
  expect(resolveFont("Georgia")).toEqual(resolveFont("Tinos"));
  expect(resolveFont("monospace")).toEqual(resolveFont("Roboto Mono"));
  expect(resolveFont("Inter Variable")).toEqual(resolveFont("Inter"));
  expect(resolveFont("unknown unavailable face")).toEqual(resolveFont("Inter"));
});

test("persists only the last five distinct valid choices and rejects malformed cached values", () => {
  let recent: string[] = [];
  for (const font of FONT_CATALOG.slice(0, 7)) recent = rememberFont(font.id, recent);
  expect(recent).toEqual(
    FONT_CATALOG.slice(2, 7)
      .map((font) => font.id)
      .reverse(),
  );
  expect(readRecentFonts()).toEqual(recent);
  expect(rememberFont(recent[2]!, recent)).toEqual([
    recent[2],
    recent[0],
    recent[1],
    recent[3],
    recent[4],
  ]);
  for (const raw of [
    "invalid",
    "42",
    JSON.stringify(["missing", 12, "inter", "inter", "arimo"]),
    "x".repeat(4097),
  ]) {
    localStorage.setItem(key, raw);
    expect(readRecentFonts()).toEqual(raw.includes("missing") ? ["inter", "arimo"] : []);
  }
  expect(rememberFont("missing", ["missing", "inter"])).toEqual(["inter"]);
});

test("keeps the current-session preference usable when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readRecentFonts()).toEqual([]);
  expect(rememberFont("tinos", ["inter"])).toEqual(["tinos", "inter"]);
});
