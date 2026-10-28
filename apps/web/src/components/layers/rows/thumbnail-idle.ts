import { yieldThumbnailInput } from "../../../services/projects/thumbnails/scheduling";

interface Job {
  run: () => void | Promise<void>;
  canceled: boolean;
}
const pending = new Set<Job>();
const capacity = 4;
let running = 0;
let scheduled: AbortController | undefined;

function stop() {
  scheduled?.abort();
  scheduled = undefined;
  if (!pending.size) document.removeEventListener("visibilitychange", wake);
}
function pump() {
  scheduled = undefined;
  if (document.hidden) return;
  // Admission only prepares metadata and looks up cached blobs. The shared preview
  // pipeline owns gesture guards and serializes every actual GPU submission.
  let admitted = 0;
  while (pending.size && running < capacity && admitted++ < capacity) {
    const job = pending.values().next().value!;
    pending.delete(job);
    running++;
    void Promise.resolve()
      .then(() => {
        if (!job.canceled) return job.run();
      })
      .catch(() => undefined)
      .finally(() => {
        running--;
        arm();
      });
  }
  arm();
}
function arm() {
  if (!pending.size) {
    stop();
    return;
  }
  if (document.hidden || running >= capacity || scheduled) return;
  const controller = new AbortController();
  scheduled = controller;
  // Cached rows should not pay one idle callback/frame per decoded thumbnail.
  // A task boundary still lets browser input run between small admission batches.
  void yieldThumbnailInput(controller.signal).then(
    () => {
      if (scheduled === controller) pump();
    },
    () => undefined,
  );
}
function wake() {
  if (!document.hidden) arm();
}
/** Four owned requests bound admission without serializing cached rows behind a cold GPU job. */
export function scheduleLayerThumbnail(run: () => void | Promise<void>): () => void {
  const job = { run, canceled: false };
  pending.add(job);
  if (pending.size === 1) document.addEventListener("visibilitychange", wake);
  arm();
  return () => {
    job.canceled = true;
    pending.delete(job);
    if (!pending.size) stop();
  };
}
