import { MediaStorageError } from "../projects/media/errors";
import {
  compareMotionTime,
  addMotionTime,
  isAudioAsset,
  type AudioAsset,
  createLayer,
  planMotionInitialization,
  type Asset,
  type Command,
  type Composition,
  type EnginePort,
  type Layer,
  type MotionInitializationPlan,
  type MotionTime,
  type VideoAsset,
} from "@musart/core";
import type { AudioOriginalProbe, VideoOriginalProbe } from "@musart/render";
import type { ProjectStore } from "../projects/storage";
import type { MediaOriginalInput } from "../projects/media/model";
import { importImage } from "./imports";
export interface MediaImportDependencies {
  store: Pick<ProjectStore, "prepareSaveCurrent" | "persistPrepared">;
  probe: (file: Blob, options?: { signal?: AbortSignal }) => Promise<VideoOriginalProbe>;
  probeAudio?: (file: Blob, options?: { signal?: AbortSignal }) => Promise<AudioOriginalProbe>;
  confirm?: (plan: MotionInitializationPlan) => Promise<boolean>;
  flush?: () => Promise<void>;
}
function fitLayer(
  asset: { id: string; kind?: "image" | "video"; name: string; width: number; height: number },
  page: Composition,
  index: number,
): Layer {
  const fit = Math.min(1, (page.width * 0.72) / asset.width, (page.height * 0.72) / asset.height);
  const width = Math.max(1, Math.round(asset.width * fit)),
    height = Math.max(1, Math.round(asset.height * fit));
  return createLayer(asset.kind === "video" ? "video" : "image", {
    id: crypto.randomUUID(),
    name: asset.name,
    assetId: asset.id,
    width,
    height,
    x: (page.width - width) / 2 + (index % 8) * 16,
    y: (page.height - height) / 2 + (index % 8) * 16,
  });
}
/** Probe/confirm/hash off-document; publish one validated undo entry after atomic native persistence. */
export async function importMediaFiles(
  engine: EnginePort,
  files: File[],
  dependencies: MediaImportDependencies,
  options: { signal?: AbortSignal; at?: MotionTime } = {},
): Promise<void> {
  if (!engine.reserveTransaction)
    throw new MediaStorageError(
      files.some((file) => file.type.startsWith("audio/"))
        ? "AUDIO_IMPORT_UNAVAILABLE"
        : "VIDEO_IMPORT_UNAVAILABLE",
      "Atomic media import is unavailable for this session.",
    );
  if (!files.length || files.length > 100) throw Error("Import between one and 100 media files.");
  const origin = engine.getSnapshot(),
    page = origin.project.pages.find((item) => item.id === origin.pageId)!;
  const assertCurrent = () => {
    options.signal?.throwIfAborted();
    const current = engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.pageId !== origin.pageId ||
      current.revision !== origin.revision
    )
      throw new DOMException("The composition changed during media preparation.", "AbortError");
  };
  const assets: Asset[] = [],
    originals: MediaOriginalInput[] = [];
  let longest: MotionTime | null = null;
  let batchBytes = 0;
  for (const file of files) {
    assertCurrent();
    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      assets.push(await importImage(file));
      continue;
    }
    if (
      file.size <= 0 ||
      file.size > 512 * 1024 * 1024 ||
      (batchBytes += file.size) > 1024 * 1024 * 1024
    )
      throw new MediaStorageError(
        file.type.startsWith("audio/") ? "AUDIO_STORAGE_LIMIT" : "VIDEO_STORAGE_LIMIT",
        "Media import is limited to 512 MiB per file and 1 GiB per batch.",
      );
    const base = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type,
      originalId: crypto.randomUUID(),
      contentRevision: crypto.randomUUID(),
      byteLength: file.size,
    };
    let asset: VideoAsset | AudioAsset;
    if (file.type.startsWith("audio/")) {
      if (!dependencies.probeAudio)
        throw new MediaStorageError(
          "AUDIO_IMPORT_UNAVAILABLE",
          "Audio metadata preparation is unavailable for this session.",
        );
      asset = { ...base, kind: "audio", ...(await dependencies.probeAudio(file, options)) };
    } else {
      const metadata = await dependencies.probe(file, options);
      asset = {
        ...base,
        kind: "video",
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        firstTimestamp: metadata.firstTimestamp,
        timeResolution: metadata.timeResolution,
        orientation: metadata.orientation,
      };
    }
    assets.push(asset);
    originals.push({
      originalId: asset.originalId,
      contentRevision: asset.contentRevision,
      blob: file,
    });
    const end = isAudioAsset(asset)
      ? addMotionTime(options.at ?? { value: 0, rate: 1 }, asset.duration)
      : asset.duration;
    if (longest === null || compareMotionTime(end, longest) > 0) longest = end;
  }
  assertCurrent();
  const layers = assets
    .filter((asset) => !isAudioAsset(asset))
    .map((asset, index) => fitLayer(asset, page, index));
  const commands: Command[] = [{ type: "addLayers", layers, assets }];
  if (longest) {
    if (!page.motion) {
      const stagedPage = { ...page, layers: [...page.layers, ...layers] };
      const staged = {
        ...origin,
        project: {
          ...origin.project,
          assets: {
            ...origin.project.assets,
            ...Object.fromEntries(assets.map((asset) => [asset.id, asset])),
          },
          pages: origin.project.pages.map((item) => (item.id === page.id ? stagedPage : item)),
        },
      };
      const plan = planMotionInitialization(staged, longest);
      if (plan.requiresConfirmation) {
        if (!dependencies.confirm)
          throw new MediaStorageError(
            "VIDEO_IMPORT_UNAVAILABLE",
            "Motion initialization requires a conversion confirmation dialog.",
          );
        if (!(await dependencies.confirm(plan))) return;
        assertCurrent();
      }
      commands.push({
        type: "setCompositionMode",
        mode: "motion",
        plan,
        ...(plan.requiresConfirmation ? { confirmed: true } : {}),
      });
    } else {
      if (page.motion.mode === "static")
        commands.push({ type: "setCompositionMode", mode: "motion" });
      if (compareMotionTime(longest, page.motion.duration) > 0)
        commands.push({ type: "setMotionDuration", duration: longest });
    }
  }
  for (const asset of assets.filter(isAudioAsset)) {
    const start = options.at ?? { value: 0, rate: 1 };
    commands.push({
      type: "addMotionAudioTrack",
      track: {
        id: crypto.randomUUID(),
        name: asset.name,
        assetId: asset.id,
        start,
        end: addMotionTime(start, asset.duration),
        sourceIn: { value: 0, rate: 1 },
        mute: false,
        volume: 1,
      },
    });
  }
  await dependencies.flush?.();
  assertCurrent();
  const reservation = engine.reserveTransaction(commands, { deferLock: true });
  try {
    const prepared = await dependencies.store.prepareSaveCurrent(reservation.project, {
      mediaOriginals: originals,
    });
    assertCurrent();
    reservation.lock();
    // Cancellation stops at this admission boundary. A durable commit must be published after ack.
    await dependencies.store.persistPrepared(prepared);
    reservation.commit();
    engine.select(layers.map((layer) => layer.id));
  } finally {
    reservation.cancel();
  }
}
