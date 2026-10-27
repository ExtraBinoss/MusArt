import { Vector4 } from "three/webgpu";
/** Raw sRGB bytes, deliberately not THREE.Color's automatic linear conversion. */
export function parseColor(value: string): Vector4 {
  if (value === "transparent") return new Vector4(0, 0, 0, 0);
  if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))
    throw new Error("Couleur de rendu invalide.");
  let hex = value.slice(1);
  if (hex.length <= 4) hex = Array.from(hex, (char) => char + char).join("");
  if (hex.length === 6) hex += "ff";
  return new Vector4(
    ...([0, 2, 4, 6].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [
      number,
      number,
      number,
      number,
    ]),
  );
}
