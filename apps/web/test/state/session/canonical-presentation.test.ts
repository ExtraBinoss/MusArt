import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import {
  CanonicalPresentation,
  getCanonicalPresentation,
} from "../../../src/state/session/canonical-presentation";

it("shares a bounded latest-frame port per engine and retains immutable ticket metadata only", () => {
  const engine = new EditorEngine();
  expect(getCanonicalPresentation(engine)).toBe(getCanonicalPresentation(engine));
  expect(getCanonicalPresentation(new EditorEngine())).not.toBe(getCanonicalPresentation(engine));
  const port = getCanonicalPresentation(engine),
    notify = vi.fn(),
    stop = port.subscribe(notify),
    publisher = port.acquire();
  const origin = { projectId: "A", revision: 1, unwanted: { large: "document" } },
    ticket = publisher.request(origin, true);
  origin.revision = 99;
  expect(ticket).toEqual({ projectId: "A", revision: 1, sequence: 1, canonical: true });
  expect(Object.isFrozen(ticket)).toBe(true);
  expect(Object.isFrozen(port.read())).toBe(true);
  expect(port.ready({ projectId: "A", revision: 1 })).toBe(false);
  publisher.present(ticket);
  expect(port.ready({ projectId: "A", revision: 1 })).toBe(true);
  expect(port.ready({ projectId: "B", revision: 1 })).toBe(false);
  expect(port.ready({ projectId: "A", revision: 2 })).toBe(false);
  const count = notify.mock.calls.length;
  publisher.present(ticket);
  expect(notify).toHaveBeenCalledTimes(count);
  stop();
  publisher.release();
  expect(notify).toHaveBeenCalledTimes(count);
});

it("requires the newest canonical ticket and never accepts old frames or transient previews", () => {
  const port = new CanonicalPresentation(),
    publisher = port.acquire(),
    origin = { projectId: "A", revision: 1 },
    first = publisher.request(origin, true);
  publisher.present(first);
  const preview = publisher.request(origin, false);
  expect(port.ready(origin)).toBe(false);
  publisher.present(preview);
  expect(port.ready(origin)).toBe(false);
  const canonical = publisher.request(origin, true);
  publisher.present(first);
  expect(port.ready(origin)).toBe(false);
  publisher.present(canonical);
  expect(port.ready(origin)).toBe(true);
  const other = port.acquire(),
    unknown = other.request({ projectId: "B", revision: 2 }, true);
  publisher.present(unknown);
  expect(port.ready(origin)).toBe(false);
  other.present(unknown);
  // Engine revisions are monotonic across project switches: the current useful frame releases old work.
  expect(port.ready(origin)).toBe(true);
  publisher.present(first);
  expect(port.read().presented).toBe(unknown);
  publisher.release();
  other.release();
});

it("owns publisher availability, recovers on a retry and ignores results after final release", () => {
  const port = new CanonicalPresentation(),
    one = port.acquire(),
    two = port.acquire();
  one.unavailable();
  one.unavailable();
  expect(port.read().available).toBe(true);
  two.release();
  two.release();
  expect(port.read().available).toBe(false);
  const ticket = one.request({ projectId: "A", revision: 2 }, true);
  expect(port.read().available).toBe(true);
  one.unavailable();
  one.present(ticket);
  expect(port.read().available).toBe(true);
  one.release();
  one.unavailable();
  one.present(ticket);
  expect(port.read().available).toBe(false);
  expect(() => one.request({ projectId: "A", revision: 3 }, true)).toThrow("released");
});
