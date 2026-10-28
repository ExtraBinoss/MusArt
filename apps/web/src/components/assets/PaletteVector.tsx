// Copied from ResumI (MIT); see docs/legal/resumi-MIT.txt.
import type { VectorArtwork } from "@musart/assets";

export function PaletteVector({ item, className }: { item: VectorArtwork; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={item.viewBox}
      data-preserve-paint={item.parts?.length ? true : undefined}
      aria-hidden
      fill={item.strokeOnly ? "none" : "currentColor"}
      stroke={item.strokeOnly ? "currentColor" : "none"}
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {item.parts?.length ? (
        item.parts.map((part, index) => (
          <path
            key={index}
            d={part.path}
            fill={part.fill}
            stroke={part.stroke ?? "none"}
            strokeWidth={part.strokeWidth}
            opacity={part.opacity}
            fillRule={part.fillRule}
            transform={part.matrix ? `matrix(${part.matrix.join(" ")})` : undefined}
            strokeLinecap={part.linecap}
            strokeLinejoin={part.linejoin}
          />
        ))
      ) : (
        <path d={item.path} />
      )}
    </svg>
  );
}
