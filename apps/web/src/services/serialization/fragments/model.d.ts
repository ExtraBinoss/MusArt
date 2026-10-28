export type FragmentPath = (string | number)[];
export type FragmentPart =
  | { type: "base"; value: unknown }
  | { type: "array"; path: FragmentPath; offset: number; total: number; value: unknown[] }
  | { type: "string"; path: FragmentPath; offset: number; total: number; value: string };
