import { normalizeMotionTime, type MotionTime } from "@musart/core";
import { VideoPlaybackCursor } from "../../../packages/render/src/sources/video/playback";
import { createVideoFrameSource } from "../../../packages/render/src/sources/video/source";
import type { VideoFrameLease } from "../../../packages/render/src/sources/video/model";

const time = (index: number): MotionTime =>
  normalizeMotionTime({ value: index * 1001, rate: 30000 });

/** Decode the existing original only: no fixture encoding, Three setup or pixel inspection. */
export async function runVideoNtscWitness() {
  const response = await fetch("/templates/motion/media/flower.mp4");
  if (!response.ok) throw new Error(`NTSC original fetch failed: ${response.status}`);
  const original = await response.blob();
  const identity = { assetId: "ntsc-original", contentRevision: "mdn-flower-v1", original };
  const source = createVideoFrameSource(identity);
  const cursor = new VideoPlaybackCursor(identity);
  const capture = (lease: VideoFrameLease | null) => {
    if (!lease) throw new Error("Exact NTSC boundary returned no covering frame.");
    try {
      return {
        timestamp: lease.timestamp,
        duration: lease.duration,
        native: lease.frame.timestamp,
      };
    } finally {
      lease.release();
    }
  };
  try {
    const metadata = await source.metadata();
    const random = [];
    for (const index of [2, 1, 3, 0]) random.push(capture(await source.requestFrame(time(index))));
    const exact = [];
    for await (const lease of source.samples([0, 1, 2, 3].map(time))) exact.push(capture(lease));
    const forward = [];
    for (const index of [0, 1, 2, 3]) forward.push(capture(await cursor.requestFrame(time(index))));
    await cursor.dispose();
    await source.dispose();
    return {
      metadata,
      random,
      exact,
      forward,
      source: source.stats(),
      cursor: cursor.stats(),
      readbacks: { ...window.__musartVideoReadbacks },
      native: {
        ...(window as unknown as { __musartNativeVideo: object }).__musartNativeVideo,
      },
      browser: navigator.userAgent,
    };
  } finally {
    await cursor.dispose();
    await source.dispose();
  }
}
