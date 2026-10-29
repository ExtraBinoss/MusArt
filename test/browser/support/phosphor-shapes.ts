import type { Page } from "@playwright/test";

/** A uniform white source makes the actual phosphor geometry measurable independently of photo content. */
export function inspectPhosphors(inspection: Page, src: string) {
  return inspection.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { width, height } = image,
      pixels = context.getImageData(0, 0, width, height).data,
      visited = new Uint8Array(width * height),
      components: { width: number; height: number }[] = [];
    const red = (i: number) =>
      pixels[i * 4]! > 128 && pixels[i * 4 + 1]! < 16 && pixels[i * 4 + 2]! < 16;
    let darkRows = 0,
      complete = 0,
      clipped = 0,
      widthSum = 0,
      heightSum = 0;
    for (let y = 0; y < height; y++) {
      let maximum = 0;
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        maximum = Math.max(maximum, pixels[at]!, pixels[at + 1]!, pixels[at + 2]!);
      }
      if (maximum === 0) darkRows++;
    }
    for (let i = 0; i < width * height; i++) {
      if (visited[i] || !red(i)) continue;
      const stack = [i];
      visited[i] = 1;
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      while (stack.length) {
        const at = stack.pop()!,
          x = at % width,
          y = Math.floor(at / width);
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
        const neighbors = [
          x > 0 ? at - 1 : -1,
          x + 1 < width ? at + 1 : -1,
          y > 0 ? at - width : -1,
          y + 1 < height ? at + width : -1,
        ];
        for (const neighbor of neighbors)
          if (neighbor >= 0 && !visited[neighbor] && red(neighbor)) {
            visited[neighbor] = 1;
            stack.push(neighbor);
          }
      }
      const size = { width: right - left + 1, height: bottom - top + 1 };
      components.push(size);
      // Edge-clipped components are reported separately; their missing extent cannot measure roundness.
      if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1) clipped++;
      else {
        complete++;
        widthSum += size.width;
        heightSum += size.height;
      }
    }
    return {
      darkRows,
      components: components.length,
      complete,
      clipped,
      meanWidth: complete ? widthSum / complete : 0,
      meanHeight: complete ? heightSum / complete : 0,
      maxHeight: Math.max(0, ...components.map((component) => component.height)),
    };
  }, src);
}
