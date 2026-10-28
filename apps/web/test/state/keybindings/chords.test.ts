import { expect, test } from "vitest";
import {
  chordKey,
  chordTokens,
  eventChord,
  normalizeChord,
  normalizeKey,
} from "../../../src/state/keybindings/chords";
const chord = { key: "k", mod: true, alt: false, shift: false };
test("normalizes portable chords and display tokens without inventing modifier-only bindings", () => {
  expect(normalizeKey("K")).toBe("k");
  expect(normalizeKey(" ")).toBe("Space");
  expect(normalizeKey("ArrowLeft")).toBe("ArrowLeft");
  expect(normalizeKey("F12")).toBe("F12");
  expect(normalizeKey("Control")).toBeNull();
  expect(normalizeKey("not a key")).toBeNull();
  expect(normalizeChord({ ...chord, key: "?", shift: true })).toEqual({ ...chord, key: "?" });
  expect(normalizeChord({ ...chord, key: "Tab", mod: false })).toBeNull();
  expect(normalizeChord({ ...chord, key: "Space" })).toBeNull();
  expect(normalizeChord({ ...chord, key: "Escape" })).toBeNull();
  for (const invalid of [null, {}, "k", { ...chord, alt: 1 }, { ...chord, key: 3 }])
    expect(normalizeChord(invalid)).toBeNull();
  expect(chordTokens({ ...chord, alt: true, shift: true, key: "ArrowRight" })).toEqual([
    "Mod",
    "Alt",
    "Shift",
    "→",
  ]);
  expect(chordTokens({ ...chord, key: "k" })).toEqual(["Mod", "K"]);
  expect(chordTokens({ ...chord, key: "Space" })).toEqual(["Mod", "Space"]);
  expect(chordKey(chord)).not.toBe(chordKey({ ...chord, alt: true }));
});
test("reads native keyboard events, ignores composition/AltGraph and treats the platform modifier consistently", () => {
  expect(eventChord(new KeyboardEvent("keydown", { key: "K", metaKey: true }))).toEqual(chord);
  expect(eventChord(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))).toEqual(chord);
  expect(eventChord(new KeyboardEvent("keydown", { key: "k", isComposing: true }))).toBeNull();
  const altGraph = new KeyboardEvent("keydown", { key: "@" });
  Object.defineProperty(altGraph, "getModifierState", { value: () => true });
  expect(eventChord(altGraph)).toBeNull();
});
