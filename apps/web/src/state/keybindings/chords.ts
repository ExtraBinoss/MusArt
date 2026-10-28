import type { KeyChord } from "./model";

const namedKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Backspace",
  "Delete",
  "Escape",
  "Enter",
  "Space",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Tab",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
export function normalizeKey(key: string): string | null {
  if (key === " ") return "Space";
  if (namedKeys.has(key)) return key;
  return /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(key) ? key.toLocaleLowerCase("en") : null;
}
export function normalizeChord(value: unknown): KeyChord | null {
  if (!value || typeof value !== "object") return null;
  const chord = value as Partial<KeyChord>;
  if (
    typeof chord.key !== "string" ||
    typeof chord.mod !== "boolean" ||
    typeof chord.alt !== "boolean" ||
    typeof chord.shift !== "boolean"
  )
    return null;
  const key = normalizeKey(chord.key);
  if (
    !key ||
    key === "Space" ||
    (key === "Tab" && !chord.mod && !chord.alt) ||
    (key === "Escape" && (chord.mod || chord.alt || chord.shift))
  )
    return null;
  // Printable punctuation already describes its shifted character on the user's layout.
  const shift = /^[\p{P}\p{S}]$/u.test(key) ? false : chord.shift;
  return { key, mod: chord.mod, alt: chord.alt, shift };
}
export function eventChord(event: KeyboardEvent): KeyChord | null {
  if (event.isComposing || event.getModifierState("AltGraph")) return null;
  return normalizeChord({
    key: event.key,
    mod: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  });
}
export function chordKey(chord: KeyChord): string {
  return JSON.stringify([chord.key, chord.mod, chord.alt, chord.shift]);
}
export function chordTokens(chord: KeyChord): string[] {
  return [
    ...(chord.mod ? ["Mod"] : []),
    ...(chord.alt ? ["Alt"] : []),
    ...(chord.shift ? ["Shift"] : []),
    (
      {
        Escape: "Esc",
        Backspace: "⌫",
        Delete: "Del",
        ArrowLeft: "←",
        ArrowRight: "→",
        ArrowUp: "↑",
        ArrowDown: "↓",
      } as Record<string, string>
    )[chord.key] ?? (chord.key.length === 1 ? chord.key.toLocaleUpperCase("en") : chord.key),
  ];
}
