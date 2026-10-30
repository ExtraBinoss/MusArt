import { createContext } from "react";

/** Scrolling label windows keep native names/titles without mounting per-row Radix tooltip trees. */
export const TimelineControlTooltips = createContext(true);
