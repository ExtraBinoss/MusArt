/** Decimal storage units describe logical bytes; browser allocation overhead is separate. */
export function formatBytes(bytes: number, language: string): string {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
  const index = Math.max(
    0,
    Math.min(units.length - 1, value ? Math.floor(Math.log10(value) / 3) : 0),
  );
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: units[index],
    unitDisplay: "short",
    maximumFractionDigits: index ? 2 : 0,
  }).format(value / 1000 ** index);
}
