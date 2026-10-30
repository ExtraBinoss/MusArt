/** Smooth, symmetric mountain envelope. Only visible peaks enter the SVG path. */
export function waveformPath(
  peaks: Float32Array,
  options: {
    width: number;
    left: number;
    visibleWidth: number;
    sourceIn: number;
    clipDuration: number;
    sourceDuration: number;
    height?: number;
  },
): string {
  const {
    width,
    left,
    visibleWidth,
    sourceIn,
    clipDuration,
    sourceDuration,
    height = 16,
  } = options;
  if (width <= 0 || visibleWidth <= 0 || sourceDuration <= 0 || clipDuration <= 0 || !peaks.length)
    return "";
  const first = Math.max(0, Math.floor(left / 3) * 3),
    after = Math.min(width, left + visibleWidth);
  if (after <= first) return "";
  const points: { x: number; amplitude: number }[] = [];
  for (let x = first; x <= after; x = Math.min(after, x + 3)) {
    const from = Math.max(
      0,
      Math.floor(((sourceIn + (x / width) * clipDuration) / sourceDuration) * peaks.length),
    );
    const to = Math.min(
      peaks.length,
      Math.max(
        from + 1,
        Math.ceil(
          ((sourceIn + (Math.min(width, x + 3) / width) * clipDuration) / sourceDuration) *
            peaks.length,
        ),
      ),
    );
    let peak = 0;
    for (let bin = from; bin < to; bin++) peak = Math.max(peak, peaks[bin] ?? 0);
    points.push({ x, amplitude: Math.max(0.6, Math.min(height / 2, (peak * height) / 2)) });
    if (x === after) break;
  }
  const center = height / 2,
    format = (value: number) => value.toFixed(1);
  const contour = (items: typeof points, side: number) => {
    let result = `L${format(items[0]!.x)},${format(center + side * items[0]!.amplitude)}`;
    for (let i = 1; i < items.length; i++) {
      const previous = items[i - 1]!,
        current = items[i]!;
      result += `Q${format(previous.x)},${format(center + side * previous.amplitude)} ${format((previous.x + current.x) / 2)},${format(center + (side * (previous.amplitude + current.amplitude)) / 2)}`;
    }
    const last = items.at(-1)!;
    return result + `L${format(last.x)},${format(center + side * last.amplitude)}`;
  };
  return (
    `M${format(first)},${format(center)}` +
    contour(points, -1) +
    contour([...points].reverse(), 1) +
    "Z"
  );
}
