import type { VideoSampleSink } from "mediabunny";
import { VideoSourceError } from "./errors";
interface DecoderControl {
  close(): void;
  decoder: { readonly state: string };
}
interface SinkInternals {
  _createDecoder: (...args: unknown[]) => Promise<unknown>;
}
const incompatible = () =>
  new VideoSourceError(
    "unsupported",
    "Sequential playback requires the verified Mediabunny 1.62.1 decoder lifecycle adapter.",
  );

/** Instance-local lifecycle adapter for pinned Mediabunny 1.62.1.
 * Its public iterator.return() does not await the native decoder pump's finally.
 * Observe/close that same decoder; demux, ordering, decoding and queues stay Mediabunny-owned.
 * No prototype/global patch, EOF draining, substitute decoder or synthetic close acknowledgement.
 */
export function acknowledgeVideoSink(sink: VideoSampleSink): { close(): Promise<void> } {
  const factory: unknown = Reflect.get(sink, "_createDecoder");
  if (typeof factory !== "function") throw incompatible();
  const original = factory as SinkInternals["_createDecoder"];
  const controls = new Set<DecoderControl>(),
    openings = new Set<Promise<unknown>>();
  let closed = false;
  Object.defineProperty(sink, "_createDecoder", {
    configurable: true,
    value: (...args: unknown[]) => {
      if (closed) return Promise.reject(new VideoSourceError("closed", "Video sink was closed."));
      const opening = original.apply(sink, args).then((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          typeof Reflect.get(value, "close") !== "function"
        )
          throw incompatible();
        const control = value as DecoderControl,
          close = control.close.bind(control);
        if (!control.decoder || typeof control.decoder.state !== "string") {
          close();
          throw incompatible(); // Custom decoders have no verified synchronous native close contract.
        }
        let released = false;
        control.close = () => {
          if (released) return;
          close();
          if (control.decoder.state !== "closed") throw incompatible();
          released = true;
          controls.delete(control);
        };
        controls.add(control);
        if (closed) {
          control.close();
          throw new VideoSourceError("closed", "Video sink was closed while opening.");
        }
        return value;
      });
      openings.add(opening);
      void opening.then(
        () => openings.delete(opening),
        () => openings.delete(opening),
      );
      return opening;
    },
  });
  let disposal: Promise<void> | null = null;
  return {
    close() {
      if (disposal) return disposal;
      closed = true;
      disposal = (async () => {
        const failures: unknown[] = [];
        for (const control of controls) {
          try {
            control.close();
          } catch (error) {
            failures.push(error);
          }
        }
        const results = await Promise.allSettled(openings);
        // Cancellation while opening is expected; all fulfilled controls close before their promise resolves.
        for (const result of results)
          if (
            result.status === "rejected" &&
            !(result.reason instanceof VideoSourceError && result.reason.code === "closed")
          )
            failures.push(result.reason);
        if (controls.size) failures.push(incompatible());
        if (failures.length)
          throw new AggregateError(failures, "Native video decoder cleanup failed.");
      })();
      return disposal;
    },
  };
}
