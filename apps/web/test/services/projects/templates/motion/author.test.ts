import { expect, test } from "vitest";
import { EditorEngine, serializeProject } from "@musart/core";
import {
  TemplateAuthor,
  seconds,
} from "../../../../../src/services/projects/templates/motion/author";
import { templateMedia } from "../../../../support/motion-template-media";

test("records genuine deterministic command batches including group, initialization and keys", () => {
  const author = new TemplateAuthor("in-bloom", "Fixture", 100, 80);
  const image = author.layer("image", "photo", "Photo", {
    assetId: "photo-0",
    width: 40,
    height: 40,
  });
  author.add([image], templateMedia());
  const group = author.group([image.id], "Group", { width: 40, height: 40 });
  author.initialize();
  author.commit(
    author.layerKeys(group, "x", [
      [0, 0],
      [1.25, 60],
    ]),
  );
  author.commit([]);
  const result = author.finish();
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const commands of result.batches) replay.transaction([...commands]);
  expect(serializeProject(replay.getSnapshot().project)).toBe(serializeProject(result.project));
  expect(result.project.pages[0]!.motion!.tracks).toHaveLength(2);
  expect(author.track(group)).toBeTruthy();
  expect(() => author.track("missing")).toThrow("Missing template track");
  expect(seconds(1.25)).toEqual({ value: 1250, rate: 1000 });
});
