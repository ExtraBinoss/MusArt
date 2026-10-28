const MAX_SEGMENTS = 8192;
/** Bounded display geometry only. The worker retains the exact full-resolution selection. */
export function selectionContour(alpha: Uint8Array, width: number, height: number) {
  let scale = Math.max(1, Math.ceil(Math.max(width, height) / 1024)),
    columns = Math.ceil(width / scale),
    rows = Math.ceil(height / scale),
    grid = new Uint8Array(columns * rows),
    selected = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[y * width + x]) {
        selected++;
        grid[Math.floor(y / scale) * columns + Math.floor(x / scale)] = 1;
      }
  for (;;) {
    const segments: string[] = [];
    const has = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < columns && y < rows ? grid[y * columns + x] : 0;
    for (let y = 0; y <= rows && segments.length <= MAX_SEGMENTS; y++)
      for (let x = 0; x < columns;) {
        if (has(x, y - 1) === has(x, y)) {
          x++;
          continue;
        }
        const start = x++;
        while (x < columns && has(x, y - 1) !== has(x, y)) x++;
        segments.push(
          `M${start * scale} ${Math.min(height, y * scale)}H${Math.min(width, x * scale)}`,
        );
      }
    for (let x = 0; x <= columns && segments.length <= MAX_SEGMENTS; x++)
      for (let y = 0; y < rows;) {
        if (has(x - 1, y) === has(x, y)) {
          y++;
          continue;
        }
        const start = y++;
        while (y < rows && has(x - 1, y) !== has(x, y)) y++;
        segments.push(
          `M${Math.min(width, x * scale)} ${start * scale}V${Math.min(height, y * scale)}`,
        );
      }
    if (segments.length <= MAX_SEGMENTS)
      return { path: segments.join(""), selected, simplified: scale > 1 };
    const nextColumns = Math.ceil(columns / 2),
      nextRows = Math.ceil(rows / 2),
      next = new Uint8Array(nextColumns * nextRows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++)
        if (grid[y * columns + x]) next[Math.floor(y / 2) * nextColumns + Math.floor(x / 2)] = 1;
    grid = next;
    columns = nextColumns;
    rows = nextRows;
    scale *= 2;
  }
}
