export interface ScreenColorResult {
  sRGBHex: string;
}
interface EyeDropperInstance {
  open: (options: { signal: AbortSignal }) => Promise<ScreenColorResult>;
}
interface EyeDropperConstructor {
  new (): EyeDropperInstance;
}
function constructor(): EyeDropperConstructor | undefined {
  const browser = window as Window & { EyeDropper?: EyeDropperConstructor };
  return browser.isSecureContext && typeof browser.EyeDropper === "function"
    ? browser.EyeDropper
    : undefined;
}
export function supportsEyeDropper(): boolean {
  return !!constructor();
}
/** Called only from the explicit button click, preserving native user activation. */
export function pickScreenColor(signal: AbortSignal): Promise<ScreenColorResult> {
  const NativeEyeDropper = constructor();
  if (!NativeEyeDropper)
    return Promise.reject(new Error("Native screen color sampling is unavailable."));
  return new NativeEyeDropper().open({ signal });
}
