import { zipSync } from "fflate";
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Record<string, Uint8Array>>) => void) | null;
  postMessage: (message: { blob?: Blob; error?: string }) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const bytes = zipSync(data, { level: 0 });
    if (bytes.byteLength > 128 * 1024 * 1024)
      throw new Error("The artboard archive exceeds the 128 MiB export limit.");
    scope.postMessage({ blob: new Blob([bytes], { type: "application/zip" }) });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "Archive encoding failed.",
    });
  }
};
