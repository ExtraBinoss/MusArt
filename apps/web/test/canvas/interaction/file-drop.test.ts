import type { DragEvent } from "react";
import { expect, it, vi } from "vitest";
import { createCanvasFileDropHandlers } from "../../../src/canvas/interaction/file-drop";

function event(types: string[], files: File[] = [], relatedTarget: Node | null = null) {
  const currentTarget = document.createElement("div");
  return {
    dataTransfer: { types, files },
    relatedTarget,
    currentTarget,
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLDivElement>;
}
it("does not claim native layer/text drags or publish overlay state while crossing the canvas", () => {
  const onActive = vi.fn(),
    onFiles = vi.fn();
  const handlers = createCanvasFileDropHandlers({ onActive, onFiles });
  for (const type of ["application/x-musart-layer", "text/plain"]) {
    const input = event([type]);
    handlers.onDragOver(input);
    handlers.onDragLeave(input);
    handlers.onDrop(input);
    expect(input.preventDefault).not.toHaveBeenCalled();
  }
  expect(onActive).not.toHaveBeenCalled();
  expect(onFiles).not.toHaveBeenCalled();
});
it("keeps native file import and its overlay, ignores empty drops and internal leave targets", () => {
  const onActive = vi.fn(),
    onFiles = vi.fn();
  const handlers = createCanvasFileDropHandlers({ onActive, onFiles });
  const input = event(["Files"]);
  handlers.onDragOver(input);
  expect(onActive).toHaveBeenLastCalledWith(true);
  const child = document.createElement("span");
  input.currentTarget.append(child);
  handlers.onDragLeave({ ...input, relatedTarget: child });
  expect(onActive).toHaveBeenCalledTimes(1);
  handlers.onDragLeave(input);
  expect(onActive).toHaveBeenLastCalledWith(false);
  handlers.onDrop(input);
  expect(onFiles).not.toHaveBeenCalled();
  const file = new File(["image"], "image.png", { type: "image/png" }),
    drop = event(["Files"], [file]);
  handlers.onDrop(drop);
  expect(onFiles).toHaveBeenCalledWith(drop, [file]);
  expect(drop.preventDefault).toHaveBeenCalled();
});
