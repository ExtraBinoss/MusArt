import type { SVGProps } from "react";
/** User-supplied static.svg and motion.svg from mode-icons; paths preserved. */
export function ModeIcon({
  mode,
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { mode: "static" | "motion"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {mode === "motion" ? (
        <>
          <path d="M4.5 8.5H7 M2.5 12H6.5 M4.5 15.5H7" />
          <path d="M13.5 5.8Q15 4.3 16.5 5.8L20.2 10Q22.2 12 20.2 14L16.5 18.2Q15 19.7 13.5 18.2L9.8 14Q7.8 12 9.8 10Z" />
          <circle cx="15" cy="12" r="1.25" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <rect x="5" y="5" width="14" height="14" rx="3.6" />
          <circle cx="12" cy="12" r="1.65" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
