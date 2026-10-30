import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { getMotionOccurrenceSelection } from "../../../src/state/motion/occurrence-selection";
test("isolates occurrence choices by project/page, removes stale identities and cleans listeners", () => {
  const project = createProject({
    id: "a",
    pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "hero" })] })],
  });
  const engine = new EditorEngine(project);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = engine.getSnapshot().project.pages[0]!,
    id = page.motion!.tracks[0]!.id;
  const session = getMotionOccurrenceSelection(engine),
    notify = vi.fn(),
    stop = session.subscribe(notify);
  expect(getMotionOccurrenceSelection(engine)).toBe(session);
  session.select(page, "hero", id);
  session.select(page, "hero", id);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(session.read(page, "hero")).toBe(id);
  session.select(page, "hero", "missing");
  expect(notify).toHaveBeenCalledTimes(1);
  engine.execute({ type: "deleteMotionOccurrence", trackId: id });
  expect(session.read(engine.getSnapshot().project.pages[0]!, "hero")).toBeUndefined();
  engine.load({ ...structuredClone(project), id: "b" });
  expect(session.read(engine.getSnapshot().project.pages[0]!, "hero")).toBeUndefined();
  stop();
  session.select(page, "hero", id);
  expect(notify).toHaveBeenCalledTimes(1);
});
