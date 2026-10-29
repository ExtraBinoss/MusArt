import { StreamTarget, type StreamTargetChunk } from "mediabunny";
import { MotionExportError } from "./errors";
const PAGE_BYTES = 64 * 1024;

/** Seekable pages or an injected writer, always checked before allocating/writing bytes. */
export function createMotionOutputTarget(options: {
  maxBytes?: number;
  output?: WritableStream<StreamTargetChunk>;
  signal?: AbortSignal;
}) {
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new MotionExportError(
      "invalidOptions",
      "Output byte budget must be a positive safe integer.",
    );
  const pages = new Map<number, Uint8Array<ArrayBuffer>>();
  const writer = options.output?.getWriter();
  let size = 0,
    finished = false,
    released = false,
    aborted = false;
  const release = () => {
    if (!released) {
      released = true;
      writer?.releaseLock();
    }
  };
  const abort = async (reason?: unknown) => {
    if (aborted) return;
    aborted = true;
    pages.clear();
    try {
      if (!released) await writer?.abort(reason);
    } finally {
      release();
    }
  };
  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      options.signal?.throwIfAborted();
      if (aborted) throw new MotionExportError("closed", "Motion output has been aborted.");
      const end = chunk.position + chunk.data.byteLength;
      if (
        !Number.isSafeInteger(chunk.position) ||
        chunk.position < 0 ||
        !Number.isSafeInteger(end) ||
        end > maxBytes
      )
        throw new MotionExportError("outputLimit", "Encoded output exceeds its byte budget.");
      if (writer) await writer.write(chunk);
      else
        for (let copied = 0; copied < chunk.data.byteLength;) {
          const position = chunk.position + copied,
            page = Math.floor(position / PAGE_BYTES),
            offset = position % PAGE_BYTES;
          let bytes = pages.get(page);
          if (!bytes) {
            bytes = new Uint8Array(Math.min(PAGE_BYTES, maxBytes - page * PAGE_BYTES));
            pages.set(page, bytes);
          }
          const length = Math.min(bytes.length - offset, chunk.data.byteLength - copied);
          bytes.set(chunk.data.subarray(copied, copied + length), offset);
          copied += length;
        }
      size = Math.max(size, end);
    },
    async close() {
      if (aborted) return;
      try {
        await writer?.close();
        finished = true;
      } finally {
        release();
      }
    },
    abort,
  });
  return {
    target: new StreamTarget(stream, { chunked: false }),
    bytes: () => size,
    abort,
    blob(mimeType: string) {
      if (!finished || !size)
        throw new MotionExportError(
          "emptyVideo",
          "Output has not produced a complete encoded file.",
        );
      if (writer) return null;
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for (let position = 0; position < size; position += PAGE_BYTES)
        parts.push(
          (
            pages.get(position / PAGE_BYTES) ??
            new Uint8Array(Math.min(PAGE_BYTES, size - position))
          ).subarray(0, Math.min(PAGE_BYTES, size - position)),
        );
      const blob = new Blob(parts, { type: mimeType });
      pages.clear();
      return blob;
    },
    async dispose(reason?: unknown) {
      pages.clear();
      if (!finished) await abort(reason);
      else release();
    },
  };
}
