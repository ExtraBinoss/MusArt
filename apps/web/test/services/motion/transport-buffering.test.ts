import { expect, it } from "vitest";
import { createPage, createProject, EditorEngine, motionTimeToSeconds } from "@musart/core";
import { MotionTransport } from "../../../src/services/motion/transport";

function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 2, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
          },
        }),
      ],
    }),
  );
  let now = 0,
    sequence = 0;
  const pending = new Map<number, () => void>();
  const transport = new MotionTransport(engine, {
    now: () => now,
    request: (callback) => {
      pending.set(++sequence, callback);
      return sequence;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  });
  return {
    engine,
    transport,
    pending,
    advance(ms: number) {
      now += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((fn) => fn());
    },
  };
}

it("parks nested buffering leases and aligns release with a native start without document edits", () => {
  const d = fixture(),
    original = d.engine.getSnapshot();
  d.transport.play();
  const first = d.transport.holdPlayback(),
    second = d.transport.holdPlayback();
  d.advance(3000);
  expect(d.pending.size).toBe(0);
  expect(d.transport.read().time.value).toBe(0);
  expect(d.transport.read().playing).toBe(true);
  first();
  first();
  expect(d.pending.size).toBe(0);
  second(10);
  d.advance(5);
  expect(d.transport.read().time.value).toBe(0);
  d.advance(25);
  expect(motionTimeToSeconds(d.transport.read().time)).toBeCloseTo(0.02);
  expect(d.engine.getSnapshot()).toBe(original);
  d.transport.dispose();
});

it("retired holds cannot alter a newer Play, seek, project or disposed transport", () => {
  const d = fixture();
  d.transport.play();
  const old = d.transport.holdPlayback();
  d.transport.pause();
  d.transport.play();
  const current = d.transport.holdPlayback();
  old();
  d.advance(500);
  expect(d.transport.read().time.value).toBe(0);
  current();
  d.advance(100);
  expect(motionTimeToSeconds(d.transport.read().time)).toBeCloseTo(0.1);
  const seek = d.transport.holdPlayback();
  d.transport.seek({ value: 1, rate: 1 });
  seek();
  expect(d.transport.read().playing).toBe(false);
  expect(d.pending.size).toBe(0);
  d.transport.play();
  const closed = d.transport.holdPlayback();
  d.transport.dispose();
  closed();
  expect(d.pending.size).toBe(0);
});

it("preserves ping-pong reverse direction while buffering instead of jumping to the forward phase", () => {
  const d = fixture();
  d.transport.setPlaybackMode("pingPong");
  d.transport.play();
  d.advance(2500);
  expect(motionTimeToSeconds(d.transport.read().time)).toBe(1.5);
  const release = d.transport.holdPlayback();
  d.advance(1000);
  release();
  d.advance(100);
  expect(motionTimeToSeconds(d.transport.read().time)).toBeCloseTo(1.4);
  d.transport.dispose();
});
