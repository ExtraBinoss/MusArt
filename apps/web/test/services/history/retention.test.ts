import { expect, it } from "vitest";
import { evaluateReplay } from "@musart/core";
import { fixture, seed } from "./fixtures";
it("compacts the base before deletion, applies adjustable limits immediately and preserves final pixels data", async () => {
  const { db, store } = await fixture();
  try {
    await seed(store, 32);
    await store.configure("history-project", { limit: 10 });
    expect(await store.info("history-project")).toMatchObject({
      count: 10,
      first: 22,
      next: 32,
      limit: 10,
    });
    const replay = await store.replay("history-project");
    expect(replay.initial.pages[0]!.layers[0]!.x).toBe(22);
    expect(replay.events[0]!.at).toBe(1000);
    expect(evaluateReplay(replay, replay.duration).pages[0]!.layers[0]!.x).toBe(32);
    expect((await store.page("history-project")).entries.map((item) => item.sequence)).toEqual([
      31, 30, 29, 28, 27, 26, 25, 24, 23, 22,
    ]);
  } finally {
    db.close();
  }
});
