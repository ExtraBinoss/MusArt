import { ensure } from "../errors";
const colorPattern = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent)$/i;
export function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  ensure(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "INVALID_DOCUMENT",
    "Objet attendu",
  );
}
export function assertText(value: unknown, maximum = 256): asserts value is string {
  ensure(
    typeof value === "string" && value.length > 0 && value.length <= maximum,
    "INVALID_DOCUMENT",
    "Texte invalide",
  );
}
export function assertNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): asserts value is number {
  ensure(
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    "INVALID_DOCUMENT",
    "Nombre hors limites",
  );
}
export function assertBoolean(value: unknown): void {
  ensure(typeof value === "boolean", "INVALID_DOCUMENT", "Booléen attendu");
}
export function assertColor(value: unknown): void {
  ensure(
    typeof value === "string" && colorPattern.test(value),
    "INVALID_DOCUMENT",
    "Couleur invalide",
  );
}
export function assertList(value: unknown, maximum: number): asserts value is unknown[] {
  ensure(
    Array.isArray(value) && value.length <= maximum,
    "INVALID_DOCUMENT",
    "Liste invalide ou trop longue",
  );
}
export function assertUniqueId(value: unknown, ids: Set<string>): void {
  assertText(value);
  ensure(
    !["__proto__", "prototype", "constructor"].includes(value),
    "INVALID_DOCUMENT",
    "Identifiant réservé",
  );
  ensure(!ids.has(value), "INVALID_DOCUMENT", `Identifiant dupliqué : ${value}`);
  ids.add(value);
}
