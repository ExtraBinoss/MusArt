import { atom } from "jotai";

/** Panel visibility is presentation state; it never changes a composition's authored timeline. */
export const timelineOpenAtom = atom(true);
