import type {
  DecodedVideoFrame,
  VideoDecodeBackendFactory,
  VideoSourceMetadata,
} from "../../../src/sources/video/model";

export class FakeFrame {
  readonly codedWidth = 2;
  displayWidth = 2;
  readonly codedHeight = 2;
  displayHeight = 2;
  closed = false;
  closes = 0;
  constructor(readonly all: FakeFrame[]) {
    all.push(this);
  }
  close() {
    this.closed = true;
    this.closes++;
  }
  clone(): VideoFrame {
    if (this.closed) throw new Error("Cannot clone a closed frame");
    return new FakeFrame(this.all) as unknown as VideoFrame;
  }
}

export function decoded(all: FakeFrame[], timestamp = 0, duration = 1): DecodedVideoFrame {
  return {
    frame: new FakeFrame(all) as unknown as VideoFrame,
    timestamp: { value: Math.round(timestamp * 1000), rate: 1000 },
    duration: { value: Math.round(duration * 1000), rate: 1000 },
    width: 2,
    height: 2,
    rotation: 0,
    flip: false,
    pixelAspectRatio: { numerator: 1, denominator: 1 },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export const metadata: VideoSourceMetadata = {
  codec: "avc",
  width: 2,
  height: 2,
  codedWidth: 2,
  codedHeight: 2,
  timeResolution: 1000,
  firstTimestamp: { value: 0, rate: 1 },
  endTimestamp: { value: 10, rate: 1 },
};

export function backendFactory(read?: (seconds: number) => Promise<DecodedVideoFrame | null>) {
  const frames: FakeFrame[] = [],
    reads: number[] = [],
    batches: number[][] = [],
    closed: number[] = [];
  let opened = 0;
  const factory: VideoDecodeBackendFactory = () => {
    const id = ++opened;
    return {
      metadata: async () => metadata,
      read: async (seconds) => {
        reads.push(seconds);
        return read ? read(seconds) : seconds < 0 ? null : decoded(frames, Math.floor(seconds));
      },
      async *batch(seconds) {
        batches.push([...seconds]);
        for (const time of seconds) yield decoded(frames, Math.floor(time));
      },
      dispose() {
        closed.push(id);
      },
    };
  };
  return { factory, frames, reads, batches, closed, opened: () => opened };
}

export async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 50 && !check(); attempt++) await Promise.resolve();
  if (!check()) throw new Error("Expected microtask boundary was not reached");
}
