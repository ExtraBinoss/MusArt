import { useSyncExternalStore } from "react";
import { MeltLogo } from "./MeltLogo";
import type { BrandActivity } from "./playback";
const noSubscription = () => () => {};
const pending = () => true;
/** A status change mounts one decorative leaf; its SVG frame clock never updates React. */
export function BrandStatus({
  size = 24,
  state = "loading",
  activity,
}: {
  size?: number;
  state?: "loading" | "preparing";
  activity?: BrandActivity;
}) {
  const active = useSyncExternalStore(
    activity?.subscribe ?? noSubscription,
    activity?.read ?? pending,
    activity?.read ?? pending,
  );
  return (
    <span className="melt-status" aria-hidden>
      {active && <MeltLogo size={size} state={state} activity={activity} />}
    </span>
  );
}
