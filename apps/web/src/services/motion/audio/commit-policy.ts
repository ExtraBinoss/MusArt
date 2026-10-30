import type {
  Composition,
  MotionAudioTrack,
  MotionProgram,
  Project,
  SessionSnapshot,
} from "@musart/core";
export interface AudioMixState {
  readonly trackId: string;
  readonly volume: number;
  readonly mute: boolean;
}
export interface AudioMixPublication {
  readonly project: Project;
  readonly pageId: string;
  readonly revision: number;
  readonly changes: readonly AudioMixState[];
}
const freeze = <T extends object>(value: T): T => {
  Object.freeze(value);
  return value;
};

function sameExcept(left: object, right: object, excluded: readonly string[]): boolean {
  const keys = Object.keys(left).filter((key) => !excluded.includes(key)),
    other = Object.keys(right).filter((key) => !excluded.includes(key));
  if (keys.length !== other.length) return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]));
}

/** Only scalar audio mix edits, with identical visual/asset/timing references, may keep Play alive. */
export function classifyAudioMixChange(
  before: SessionSnapshot,
  after: SessionSnapshot,
): AudioMixPublication | null {
  if (
    after.revision !== before.revision + 1 ||
    after.pageId !== before.pageId ||
    (!after.canUndo && !after.canRedo) ||
    before.project === after.project ||
    before.project.pages.length !== after.project.pages.length ||
    !sameExcept(before.project, after.project, ["pages", "updatedAt"])
  )
    return null;
  const previous = before.project.pages.find((page) => page.id === before.pageId),
    page = after.project.pages.find((item) => item.id === after.pageId);
  if (
    !previous ||
    !page ||
    previous.motion?.mode !== "motion" ||
    page.motion?.mode !== "motion" ||
    !sameExcept(previous, page, ["motion"]) ||
    !sameExcept(previous.motion, page.motion, ["audioTracks"])
  )
    return null;
  for (let index = 0; index < before.project.pages.length; index++) {
    const old = before.project.pages[index]!,
      current = after.project.pages[index]!;
    if (old.id !== current.id || (old.id !== page.id && old !== current)) return null;
  }
  const oldTracks = previous.motion.audioTracks ?? [],
    tracks = page.motion.audioTracks ?? [];
  if (oldTracks.length !== tracks.length) return null;
  const changes: AudioMixState[] = [];
  for (let index = 0; index < tracks.length; index++) {
    const old = oldTracks[index]!,
      track = tracks[index]!;
    if (old === track) continue;
    if (old.id !== track.id || !sameExcept(old, track, ["volume", "mute"])) return null;
    if (old.volume !== track.volume || old.mute !== track.mute)
      changes.push(freeze({ trackId: track.id, volume: track.volume, mute: track.mute }));
  }
  return changes.length
    ? freeze({
        project: after.project,
        pageId: after.pageId,
        revision: after.revision,
        changes: freeze(changes),
      })
    : null;
}

/** Compiled visual channels/segments remain byte-for-byte the same objects; only audio metadata rebases. */
export function rebaseAudioMixProgram(
  program: MotionProgram,
  publication: AudioMixPublication,
): MotionProgram {
  const changes = new Map(publication.changes.map((change) => [change.trackId, change]));
  const update = (track: MotionAudioTrack) => {
    const change = changes.get(track.id);
    return change ? freeze({ ...track, volume: change.volume, mute: change.mute }) : track;
  };
  const authored = program.composition.motion;
  const motion = authored
    ? freeze({
        ...authored,
        ...(authored.audioTracks ? { audioTracks: freeze(authored.audioTracks.map(update)) } : {}),
      })
    : undefined;
  const composition = freeze({ ...program.composition, ...(motion ? { motion } : {}) });
  const audio = freeze(
    program.audio.map((lane) => {
      const change = changes.get(lane.id);
      return change
        ? freeze({
            ...lane,
            media: freeze({ ...lane.media, volume: change.volume, mute: change.mute }),
          })
        : lane;
    }),
  );
  return freeze({ ...program, composition, audio });
}

export function rebaseAudioMixFrame(
  frame: Composition | null,
  program: MotionProgram,
): Composition | null {
  return frame
    ? freeze({
        ...frame,
        ...(program.composition.motion ? { motion: program.composition.motion } : {}),
      })
    : null;
}
