import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

/** Diagnostic native layout/paint trace; excluded from normal latency measurements. */
export async function withNativeTimeline<T>(
  page: Page,
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const clock = await session.send("Performance.getMetrics");
  await session.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,blink.user_timing,input,latencyInfo",
    transferMode: "ReturnAsStream",
  });
  try {
    return await task();
  } finally {
    const complete = new Promise<string>((resolve) =>
      session.once("Tracing.tracingComplete", (event) => resolve(event.stream!)),
    );
    await session.send("Tracing.end");
    const stream = await complete;
    try {
      let content = "";
      for (;;) {
        const chunk = await session.send("IO.read", { handle: stream });
        content += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
        if (chunk.eof) break;
      }
      await mkdir("artifacts", { recursive: true });
      await writeFile(`artifacts/${name}-timeline.json`, content);
      await writeFile(`artifacts/${name}-clock.json`, JSON.stringify(clock));
    } finally {
      await session.send("IO.close", { handle: stream });
      await session.detach();
    }
  }
}
