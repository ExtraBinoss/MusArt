import { chordKey, normalizeChord } from "./chords";
import { BINDING_COMMANDS, isCommandId } from "./registry";
import type { BindingOverrides, BindingSnapshot, CommandId, KeyChord } from "./model";

export const KEYBINDINGS_STORAGE_KEY = "musart.keybindings.v1";
export class KeybindingError extends Error {
  constructor(
    readonly code: "invalid" | "collision" | "storage",
    readonly conflict?: CommandId,
  ) {
    super(code);
    this.name = "KeybindingError";
  }
}
function chords(value: unknown): readonly KeyChord[] {
  if (!Array.isArray(value) || value.length > 2) throw new KeybindingError("invalid");
  const result = value.map(normalizeChord);
  if (result.some((value) => !value)) throw new KeybindingError("invalid");
  return Object.freeze([
    ...new Map(result.map((chord) => [chordKey(chord!), Object.freeze(chord!)])).values(),
  ]);
}
export function bindingSnapshot(
  overrides: BindingOverrides = {},
  changed?: CommandId,
): BindingSnapshot {
  const safe: Partial<Record<CommandId, readonly KeyChord[]>> = {};
  for (const [id, value] of Object.entries(overrides)) {
    if (!isCommandId(id)) throw new KeybindingError("invalid");
    safe[id] = chords(value);
  }
  const occupied = new Map<string, CommandId>(),
    bindings = new Map<CommandId, readonly KeyChord[]>();
  for (const command of BINDING_COMMANDS) {
    const values = safe[command.id] ?? chords(command.defaults);
    for (const chord of values) {
      const identity = chordKey(chord),
        conflict = occupied.get(identity);
      if (conflict && conflict !== command.id) {
        const other =
          conflict === changed ||
          (!changed && Object.hasOwn(safe, conflict) && !Object.hasOwn(safe, command.id))
            ? command.id
            : conflict;
        throw new KeybindingError("collision", other);
      }
      occupied.set(identity, command.id);
    }
    bindings.set(command.id, values);
  }
  return Object.freeze({ overrides: Object.freeze(safe), bindings });
}
export function readBindings(serialized: string | null): BindingSnapshot {
  if (!serialized || serialized.length > 32768) return bindingSnapshot();
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("overrides" in parsed) ||
      !parsed.overrides ||
      typeof parsed.overrides !== "object" ||
      Array.isArray(parsed.overrides)
    )
      return bindingSnapshot();
    const known = Object.fromEntries(
      Object.entries(parsed.overrides).filter(([id]) => isCommandId(id)),
    );
    return bindingSnapshot(known);
  } catch {
    return bindingSnapshot();
  }
}
export function serializeBindings(snapshot: BindingSnapshot): string {
  return JSON.stringify({ version: 1, overrides: snapshot.overrides });
}
