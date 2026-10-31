import { printGeometry, type PrintPageGeometry } from "./geometry";

const text = new TextEncoder();
const n = (value: number) => Number(value.toFixed(4));
function literal(value: string) {
  let encoded = "";
  for (const character of value) {
    const code = character.codePointAt(0)!;
    encoded +=
      code >= 160 && code <= 255
        ? `\\${code.toString(8).padStart(3, "0")}`
        : character
            .normalize("NFKD")
            .replace(/[^\x20-\x7e]/g, "")
            .replace(/[\\()]/g, "\\$&");
  }
  return encoded;
}

function unicode(value: string) {
  return (
    "FEFF" +
    Array.from({ length: value.length }, (_, i) =>
      value.charCodeAt(i).toString(16).padStart(4, "0"),
    ).join("")
  );
}
/** A raster print PDF with ICCBased image, output intent, vector marks and explicit page boxes. */
export function createPrintPdf(
  jpeg: Uint8Array,
  profile: Uint8Array,
  page: PrintPageGeometry,
): Blob {
  const { options } = page,
    print = options.print;
  const cmyk = options.colorMode === "cmyk";
  const { labelSize, w, h, margin, totalW, totalH, trim, lines, registration, bars, label } =
    printGeometry(page);
  const [l, b, r, t] = trim;
  const commands = ["/Perceptual ri", `q ${n(w)} 0 0 ${n(h)} ${margin} ${margin} cm /Artwork Do Q`];
  if (print.cropMarks) {
    commands.push("q 0 0 0 1 K 0.25 w");
    for (const [x1, y1, x2, y2] of lines)
      commands.push(`${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
    commands.push("Q");
  }
  if (print.registrationMarks) {
    commands.push("q /Registration CS 1 SCN 0.25 w");
    for (const [x, y] of registration) {
      commands.push(
        `${n(x! - 6)} ${n(y!)} m ${n(x! + 6)} ${n(y!)} l S`,
        `${n(x!)} ${n(y! - 6)} m ${n(x!)} ${n(y! + 6)} l S`,
      );
      const d = 2.2091;
      commands.push(
        `${n(x! + 4)} ${n(y!)} m ${n(x! + 4)} ${n(y! + d)} ${n(x! + d)} ${n(y! + 4)} ${n(x!)} ${n(y! + 4)} c ${n(x! - d)} ${n(y! + 4)} ${n(x! - 4)} ${n(y! + d)} ${n(x! - 4)} ${n(y!)} c ${n(x! - 4)} ${n(y! - d)} ${n(x! - d)} ${n(y! - 4)} ${n(x!)} ${n(y! - 4)} c ${n(x! + d)} ${n(y! - 4)} ${n(x! + 4)} ${n(y! - d)} ${n(x! + 4)} ${n(y!)} c S`,
      );
    }
    commands.push("Q");
  }
  if (print.colorBars) {
    const colors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [1, 0, 1, 0],
    ];
    const size = Math.min(9, w / bars.length);
    colors.forEach((color, index) =>
      commands.push(`q ${color.join(" ")} k ${n(margin + index * size)} 9 ${n(size)} 7 re f Q`),
    );
  }
  if (print.pageInfo) {
    const printedLabel = literal(label);
    commands.push(
      `q 0 0 0 1 k BT /Label ${n(labelSize)} Tf 8 ${n(totalH - 13)} Td (${printedLabel}) Tj ET Q`,
    );
  }
  const objects: Uint8Array[] = [];
  const add = (value: string | Uint8Array) =>
    objects.push(typeof value === "string" ? text.encode(value) : value);
  const stream = (dictionary: string, data: Uint8Array) => {
    const head = text.encode(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
      tail = text.encode("\nendstream");
    const bytes = new Uint8Array(head.length + data.length + tail.length);
    bytes.set(head);
    bytes.set(data, head.length);
    bytes.set(tail, head.length + data.length);
    return bytes;
  };
  add("<< /Type /Catalog /Pages 2 0 R /OutputIntents [8 0 R] >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(totalW)} ${n(totalH)}] /BleedBox [${margin} ${margin} ${n(margin + w)} ${n(margin + h)}] /TrimBox [${n(l)} ${n(b)} ${n(r)} ${n(t)}] /Resources << /XObject << /Artwork 5 0 R >> /Font << /Label 7 0 R >> /ColorSpace << /Registration [/Separation /All /DeviceCMYK 10 0 R] >> >> /Contents 4 0 R >>`,
  );
  add(stream("", text.encode(commands.join("\n"))));
  add(
    stream(
      `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /BitsPerComponent 8 /Intent /Perceptual /ColorSpace [/ICCBased 6 0 R] /Filter /DCTDecode ${cmyk ? "/Decode [1 0 1 0 1 0 1 0]" : ""}`,
      jpeg,
    ),
  );
  add(stream(`/N ${cmyk ? 4 : 3} /Alternate /Device${cmyk ? "CMYK" : "RGB"}`, profile));
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add(
    `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${cmyk ? "CGATS21 CRPC6" : "sRGB"}) /RegistryName (https://www.color.org) /DestOutputProfile 6 0 R >>`,
  );
  add(
    `<< /Title <${unicode(page.name)}> /Creator <${unicode(page.creator ?? "@musart/render")}> >>`,
  );
  add("<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 1 1 1] /N 1 >>");
  const chunks: Uint8Array[] = [text.encode("%PDF-1.7\n%Melt\n")];
  const offsets = [0];
  let cursor = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(cursor);
    const head = text.encode(`${index + 1} 0 obj\n`),
      tail = text.encode("\nendobj\n");
    chunks.push(head, object, tail);
    cursor += head.length + object.length + tail.length;
  });
  chunks.push(
    text.encode(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${cursor}\n%%EOF\n`,
    ),
  );
  return new Blob(
    chunks.map((chunk) => new Uint8Array(chunk)),
    { type: "application/pdf" },
  );
}
