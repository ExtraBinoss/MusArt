import { useEffect, useRef } from "react";

/** A finite masked letter reveal. Hidden tabs pause CSS work; reduced motion stays readable. */
export function HeroHeadline({ lines }: { lines: readonly string[] }) {
  const element = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const sync = () => element.current?.toggleAttribute("data-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <h1 ref={element} className="landing-headline" aria-label={lines.join(" ")}>
      {lines.map((line, row) => (
        <span className="hero-line" key={line} aria-hidden>
          {Array.from(line).map((letter, index) => (
            <span className="hero-letter-mask" key={`${index}:${letter}`}>
              <span
                className="hero-letter"
                style={{ animationDelay: `${row * 0.22 + index * 0.055}s` }}
              >
                {letter === " " ? "\u00a0" : letter}
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}
