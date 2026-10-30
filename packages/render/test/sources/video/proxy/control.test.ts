import { expect, it, vi } from "vitest";
import type { Conversion } from "mediabunny";
import { VideoProxyConversionControl } from "../../../../src/sources/video/proxy/control";

it("resumes the same native conversion after pauseSignal settles, retaining its prefix", async () => {
  let state = "ready",
    prefix = 0;
  const states: string[] = [];
  const control = new VideoProxyConversionControl((value) => {
    states.push(value);
    if (value === "paused") control.setPaused(false);
  });
  const execute = vi.fn(async ({ pauseSignal }: { pauseSignal: AbortSignal }) => {
    prefix++;
    if (prefix === 1) {
      control.setPaused(true);
      expect(pauseSignal.aborted).toBe(true);
      state = "paused";
    } else state = "done";
  });
  const conversion = {
    get state() {
      return state;
    },
    execute,
  } as unknown as Conversion;
  await control.execute(conversion);
  expect(prefix).toBe(2);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(states).toEqual(["running", "paused", "running"]);
});

it("waits when paused before initialization, and propagates real codec failures", async () => {
  const failure = Error("native codec failed"),
    execute = vi.fn(async () => {
      throw failure;
    });
  const control = new VideoProxyConversionControl((state) => {
    if (state === "paused") control.setPaused(false);
  });
  control.setPaused(true);
  await expect(control.execute({ state: "ready", execute } as unknown as Conversion)).rejects.toBe(
    failure,
  );
  expect(execute).toHaveBeenCalledOnce();
});
