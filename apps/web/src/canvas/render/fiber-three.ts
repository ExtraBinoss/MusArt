// The Vite compatibility resolver redirects only R3F's own bare `three` import here.
// All geometry/material identities remain the original Three exports.
export * from "three";
export { FiberTimerClock as Clock } from "./fiber-timer";
