export interface RulerTick {
  position: number;
  value: number;
  major: boolean;
}
export function rulerTicks(length: number, origin: number, zoom: number): RulerTick[] {
  if (length <= 0 || zoom <= 0) return [];
  const power = 10 ** Math.floor(Math.log10(80 / zoom));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((value) => value * zoom >= 60)!;
  const minor = step / 5;
  const first = Math.ceil(-origin / zoom / minor);
  const last = Math.floor((length - origin) / zoom / minor);
  return Array.from({ length: Math.min(2000, last - first + 1) }, (_, index) => {
    const unit = first + index;
    return { position: origin + unit * minor * zoom, value: unit * minor, major: unit % 5 === 0 };
  });
}
