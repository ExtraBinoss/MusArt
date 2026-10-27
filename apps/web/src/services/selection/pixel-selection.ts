/** Connected four-neighbour selection against the seed color. Original alpha is retained. */
export function floodMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance: number,
): Uint8ClampedArray {
  if (
    width < 1 ||
    height < 1 ||
    data.length !== width * height * 4 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(tolerance)
  )
    throw new Error("Pixels ou sélection invalides.");
  const sx = Math.max(0, Math.min(width - 1, Math.floor(x))),
    sy = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const start = sy * width + sx,
    seed = start * 4;
  const output = new Uint8ClampedArray(data.length),
    visited = new Uint8Array(width * height),
    queue = new Uint32Array(width * height);
  const distance = Math.max(0, Math.min(255, tolerance)) ** 2 * 3;
  let head = 0,
    tail = 1;
  queue[0] = start;
  visited[start] = 1;
  const enqueue = (neighbor: number) => {
    if (!visited[neighbor]) {
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  };
  while (head < tail) {
    const pixel = queue[head++]!,
      offset = pixel * 4;
    if (data[offset + 3] === 0) continue;
    const difference =
      (data[offset]! - data[seed]!) ** 2 +
      (data[offset + 1]! - data[seed + 1]!) ** 2 +
      (data[offset + 2]! - data[seed + 2]!) ** 2;
    if (difference > distance) continue;
    output[offset] = 255;
    output[offset + 1] = 255;
    output[offset + 2] = 255;
    output[offset + 3] = data[offset + 3]!;
    const col = pixel % width,
      row = Math.floor(pixel / width);
    if (col > 0) enqueue(pixel - 1);
    if (col < width - 1) enqueue(pixel + 1);
    if (row > 0) enqueue(pixel - width);
    if (row < height - 1) enqueue(pixel + width);
  }
  return output;
}
export function maskToDataUrl(data: Uint8ClampedArray, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponible.");
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL("image/png");
}
