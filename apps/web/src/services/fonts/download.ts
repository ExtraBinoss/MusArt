import { MAX_FONT_FILE_BYTES } from "@musart/assets";
import { FontLibraryError } from "./validation";
export type FontFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function readFontBlob(blob: Blob): Promise<ArrayBuffer> {
  if (blob.size > MAX_FONT_FILE_BYTES)
    throw new FontLibraryError("tooLarge", "Font exceeds the 32 MiB limit.");
  return blob.arrayBuffer();
}
export async function downloadFont(
  url: string,
  fetcher: FontFetcher,
  signal: AbortSignal,
  maximumBytes = MAX_FONT_FILE_BYTES,
): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAX_FONT_FILE_BYTES)
    throw new RangeError("Invalid font download byte limit.");
  const tooLarge =
    maximumBytes === MAX_FONT_FILE_BYTES
      ? "Font exceeds the 32 MiB limit."
      : "Font exceeds the preview byte limit.";
  if (
    !url.startsWith(`${import.meta.env.BASE_URL}fonts/`) &&
    !/^https:\/\/(raw\.githubusercontent\.com|fonts\.gstatic\.com)\//.test(url)
  )
    throw new FontLibraryError(
      "unsupported",
      "The font source is not an approved Google Fonts URL.",
    );
  const response = await fetcher(url, { signal });
  if (!response.ok)
    throw new FontLibraryError("download", `Font download failed (${response.status}).`);
  if (Number(response.headers.get("content-length")) > maximumBytes) {
    await response.body?.cancel();
    throw new FontLibraryError("tooLarge", tooLarge);
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maximumBytes) throw new FontLibraryError("tooLarge", tooLarge);
    return bytes;
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new FontLibraryError("tooLarge", tooLarge);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
export function abortable<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException("Font request cancelled.", "AbortError"));
    if (signal.aborted) {
      void pending.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
