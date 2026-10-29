import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  normalizeMotionTime,
  validateMotionTime,
  type MotionTime,
  type Project,
} from "../../packages/core/src/index";

/** Decimal seconds and tick/rate fractions retain exact, portable integer time. */
export function parseHeadlessTime(text: string): MotionTime {
  let time: MotionTime;
  if (/^-?\d+\/\d+$/.test(text)) {
    const [value, rate] = text.split("/").map(Number);
    time = { value: value!, rate: rate! };
  } else if (/^-?\d+(?:\.\d{1,9})?$/.test(text)) {
    const decimals = text.split(".")[1]?.length ?? 0;
    time = { value: Number(text.replace(".", "")), rate: 10 ** decimals };
  } else
    throw new Error(
      "--time must be decimal seconds or integer ticks/rate (for example 0.5 or 15/30).",
    );
  validateMotionTime(time);
  return normalizeMotionTime(time);
}

/** No browser import, media IO or running app is required to inspect authored animation. */
export function evaluateHeadlessMotion(project: Project, compositionId: string, time: string) {
  const program = compileMotion(project, { compositionId });
  const plan = evaluateMotion(program, parseHeadlessTime(time));
  return { ...plan, composition: applyMotionFrame(program, plan) };
}
