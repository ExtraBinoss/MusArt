export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export type WorkingColorSpace = "srgb" | "display-p3" | "cmyk" | "cmyk-proof";
export type Alignment = "start" | "center" | "end";
export type LayoutReference = "page" | "selection" | "parent";
export const ZERO_INSETS: Readonly<Insets> = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
