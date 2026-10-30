import { expect, test, vi } from "vitest";
import { captureKeyframeDelete } from "../../../src/components/motion/keyframe-actions";
function fixture(initial: string[] = []) {
  let selected = new Set(initial);
  return {
    readSelected: () => selected,
    selectKey: vi.fn((id: string) => {
      selected = new Set([id]);
    }),
    deleteSelected: vi.fn(),
    replace: (ids: string[]) => {
      selected = new Set(ids);
    },
  };
}
test("right-clicking a new key selects only it, then removes that captured selection once", () => {
  const gestures = fixture(["other"]),
    layer = vi.fn();
  const remove = captureKeyframeDelete(gestures, "key", layer);
  expect(remove.count).toBe(1);
  expect(gestures.selectKey).toHaveBeenCalledWith("key", false);
  expect(layer).toHaveBeenCalledOnce();
  remove();
  remove();
  expect(gestures.deleteSelected).toHaveBeenCalledOnce();
});
test("a selected key preserves its selected group while later selections reject an old menu", () => {
  const gestures = fixture(["a", "b"]),
    layer = vi.fn();
  const remove = captureKeyframeDelete(gestures, "a", layer);
  expect(remove.count).toBe(2);
  expect(gestures.selectKey).not.toHaveBeenCalled();
  expect(layer).not.toHaveBeenCalled();
  gestures.replace(["new"]);
  remove();
  expect(gestures.deleteSelected).not.toHaveBeenCalled();
});
