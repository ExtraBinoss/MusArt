import { expect, test, vi } from "vitest";
import { layerDragImage } from "../../../../src/components/layers/drag/drag-image";

test("native drag image contains only the existing thumbnail and literal name on transparency", () => {
  const row = document.createElement("div");
  row.innerHTML =
    '<span class="layer-thumbnail"><img src="blob:real" data-thumbnail-reveal="true"></span><button>Hide</button><div class="attachment-cards">Effect</div>';
  row.style.background = "gray";
  Object.defineProperties(row.querySelector("img"), {
    complete: { value: true },
    naturalWidth: { value: 96 },
  });
  const transfer = { setDragImage: vi.fn() };
  const source = row.firstElementChild;
  const cleanup = layerDragImage(row, transfer as unknown as DataTransfer, "<b>Layer</b>");
  const preview = document.querySelector<HTMLElement>(".layer-drag-preview")!;
  expect(preview.children).toHaveLength(2);
  expect(preview).toHaveAttribute("aria-hidden", "true");
  expect(preview.style.background).toBe("transparent");
  expect(preview.style.left).toBe("-10000px");
  expect(preview.querySelector(".layer-name")).toHaveTextContent("<b>Layer</b>");
  expect(preview.querySelector("button, .attachment-cards, b")).toBeNull();
  const image = preview.querySelector("img")!;
  expect(image).toHaveAttribute("src", "blob:real");
  expect(image).not.toHaveAttribute("data-thumbnail-reveal");
  expect(image.style.animation).toBe("none");
  expect(image.style.opacity).toBe("1");
  expect(row.firstElementChild).toBe(source);
  expect(row.querySelector("img")).toHaveAttribute("data-thumbnail-reveal", "true");
  expect(transfer.setDragImage).toHaveBeenCalledExactlyOnceWith(preview, 12, 12);
  cleanup();
  cleanup();
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
});

test("an undecoded or failed image uses its actual layer-kind placeholder without another render", () => {
  const row = document.createElement("div"),
    transfer = { setDragImage: vi.fn() };
  row.innerHTML =
    '<span class="layer-thumbnail"><svg class="lucide-square" style="display:none"><rect width="18" height="18"></rect></svg><img src="blob:pending"></span>';
  const placeholder = row.querySelector("svg")!;
  const cleanup = layerDragImage(row, transfer as unknown as DataTransfer, "Rectangle");
  const preview = document.querySelector(".layer-drag-preview")!;
  expect(preview.querySelector("img")).toBeNull();
  expect(preview.querySelector("svg")).toHaveClass("lucide-square");
  expect(preview.querySelector("svg")!.style.display).toBe("");
  expect(placeholder.style.display).toBe("none");
  expect(row.querySelector("svg")).toBe(placeholder);
  cleanup();
});

test("missing thumbnails retain a truthful name and setDragImage failures release their clone", () => {
  const row = document.createElement("div"),
    transfer = { setDragImage: vi.fn() };
  const cleanup = layerDragImage(row, transfer as unknown as DataTransfer, "Layer");
  expect(document.querySelector(".layer-drag-preview")?.children).toHaveLength(1);
  cleanup();
  transfer.setDragImage.mockImplementation(() => {
    throw Error("Native image rejected");
  });
  expect(() => layerDragImage(row, transfer as unknown as DataTransfer, "Layer")).toThrow(
    "Native image rejected",
  );
  expect(document.querySelector(".layer-drag-preview")).toBeNull();
});
