import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import type { BrandActivity } from "../../../ui/brand/playback";
import "./throbber.css";
const noSubscription = () => () => {};
const pending = () => true;
/** Presentation delay suppresses flashes; it never postpones the operation or its result. */
export function Throbber({
  active = true,
  activity,
  label,
  size = 24,
  variant = "mascot",
  delayMs = 160,
  className = "",
  decorative = false,
}: {
  active?: boolean;
  activity?: BrandActivity;
  label?: string;
  size?: number;
  variant?: "mascot" | "dots" | "shimmer";
  delayMs?: number;
  className?: string;
  decorative?: boolean;
}) {
  const running =
    useSyncExternalStore(
      activity?.subscribe ?? noSubscription,
      activity?.read ?? pending,
      activity?.read ?? pending,
    ) && active;
  const playback = useMemo(() => ({ read: () => running, subscribe: noSubscription }), [running]);
  const [mounted, setMounted] = useState(running && delayMs === 0);
  useEffect(() => {
    if (running === mounted) return;
    const timer = setTimeout(() => setMounted(running), running ? delayMs : 160);
    return () => clearTimeout(timer);
  }, [running, delayMs, mounted]);
  return (
    <span
      className={`ui-throbber ${className}`}
      data-variant={variant}
      data-visible={running && mounted}
      data-active={running}
      style={{ "--throbber-size": `${size}px` } as CSSProperties}
      role={!decorative && running && mounted ? "status" : undefined}
      aria-hidden={decorative || !running || !mounted || undefined}
    >
      {mounted && (
        <>
          <span className="ui-throbber-mark" aria-hidden>
            {variant === "dots" ? (
              <span className="ui-throbber-dots">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <MeltLogo size={size} state="working" activity={playback} />
            )}
          </span>
          {label && <span className="ui-throbber-label">{label}</span>}
        </>
      )}
    </span>
  );
}
