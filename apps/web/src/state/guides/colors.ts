export const DEFAULT_GUIDE_COLOR = "#ed66c2";
export const GUIDE_COLOR_KEY = "musart.guides.last-color";
type ColorStorage = Pick<Storage, "getItem" | "setItem">;
const valid = (value: unknown): value is string =>
  typeof value === "string" && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value);

/** Tiny user preference; storage failures preserve the most recent in-session choice. */
export class GuideColors {
  private last = DEFAULT_GUIDE_COLOR;
  constructor(private readonly storage: () => ColorStorage = () => localStorage) {}
  read(): string {
    try {
      const value = this.storage().getItem(GUIDE_COLOR_KEY);
      if (valid(value)) this.last = value.toLowerCase();
    } catch {
      /* Storage can be disabled by the browser. */
    }
    return this.last;
  }
  remember(value: string): void {
    if (!valid(value)) throw new Error("Invalid guide color preference.");
    this.last = value.toLowerCase();
    try {
      this.storage().setItem(GUIDE_COLOR_KEY, this.last);
    } catch {
      /* Keep the current session usable. */
    }
  }
}
export const guideColors = new GuideColors();
