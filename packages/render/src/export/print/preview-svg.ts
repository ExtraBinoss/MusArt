import { printGeometry, type PrintPageGeometry } from "./geometry";
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
/** Uses the same page geometry as the PDF; the image is a native ICC soft proof. */
export function createPrintPreview(png: Uint8Array, page: PrintPageGeometry): Blob {
  const { labelSize, w, h, margin, totalW, totalH, lines, registration, bars, label } =
    printGeometry(page);
  let binary = "";
  for (let i = 0; i < png.length; i += 8192)
    binary += String.fromCharCode(...png.subarray(i, i + 8192));
  const children = [
    `<rect width="${totalW}" height="${totalH}" fill="white"/>`,
    `<image x="${margin}" y="${margin}" width="${w}" height="${h}" href="data:image/png;base64,${btoa(binary)}"/>`,
  ];
  for (const [x1, y1, x2, y2] of lines)
    children.push(
      `<path d="M${x1} ${totalH - y1}L${x2} ${totalH - y2}" fill="none" stroke="black" stroke-width="0.25"/>`,
    );
  for (const [x, y] of registration)
    children.push(
      `<g stroke="black" stroke-width="0.25" fill="none"><circle cx="${x}" cy="${totalH - y}" r="4"/><path d="M${x - 6} ${totalH - y}h12M${x} ${totalH - y - 6}v12"/></g>`,
    );
  const size = Math.min(9, w / Math.max(1, bars.length));
  bars.forEach((fill, index) =>
    children.push(
      `<rect x="${margin + index * size}" y="${totalH - 16}" width="${size}" height="7" fill="${fill}"/>`,
    ),
  );
  if (label)
    children.push(
      `<text x="8" y="13" font-family="sans-serif" font-size="${labelSize}" fill="black">${xml(label)}</text>`,
    );
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${children.join("")}</svg>`,
    ],
    { type: "image/svg+xml" },
  );
}
