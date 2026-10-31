import type { ManagedImageOptions } from "./model";
export interface PrintPageGeometry {
  width: number;
  height: number;
  trimWidth: number;
  trimHeight: number;
  name: string;
  creator?: string;
  options: ManagedImageOptions;
}
export function printGeometry(page: PrintPageGeometry) {
  const { print } = page.options,
    pt = 72 / print.dpi;
  const w = page.width * pt,
    h = page.height * pt;
  const bx = ((page.width - page.trimWidth) * pt) / 2,
    by = ((page.height - page.trimHeight) * pt) / 2;
  const margin =
    print.cropMarks || print.registrationMarks || print.colorBars || print.pageInfo ? 28 : 0;
  const totalW = w + 2 * margin,
    totalH = h + 2 * margin;
  const trim = [margin + bx, margin + by, margin + w - bx, margin + h - by] as const;
  const lines: [number, number, number, number][] = [];
  if (print.cropMarks) {
    for (const x of [trim[0], trim[2]])
      lines.push([x, margin - 3, x, margin - 13], [x, margin + h + 3, x, margin + h + 13]);
    for (const y of [trim[1], trim[3]])
      lines.push([margin - 3, y, margin - 13, y], [margin + w + 3, y, margin + w + 13, y]);
  }
  const registration = print.registrationMarks
    ? ([
        [margin / 2, totalH / 2],
        [totalW - margin / 2, totalH / 2],
      ] as const)
    : [];
  const bars = print.colorBars
    ? ["#00ffff", "#ff00ff", "#ffff00", "#000000", "#0000ff", "#ff0000", "#00ff00"]
    : [];
  const label = print.pageInfo
    ? `${page.name} | ${page.options.colorMode === "cmyk" ? "CMYK - CGATS21 CRPC6" : "sRGB"} | ${print.dpi} dpi`
    : "";
  const labelSize = Math.min(7, (totalW - 16) / Math.max(1, label.length));
  return { labelSize, w, h, margin, totalW, totalH, trim, lines, registration, bars, label };
}
