import { waveformPoints, type TimelineWaveformPaths } from "./waveform-paths";
import type {
  TimelineCanvasClip,
  TimelineCanvasHit,
  TimelineCanvasPalette,
  TimelineCanvasRect,
  TimelineCanvasScene,
} from "./model";

function sameHit(a: TimelineCanvasHit | null, b: TimelineCanvasHit) {
  if (!a || a.rowKey !== b.rowKey) return false;
  if ("keyId" in a && "keyId" in b) return a.kind === b.kind && a.keyId === b.keyId;
  if ("trackId" in a && "trackId" in b) return a.trackId === b.trackId;
  return a.kind === b.kind;
}
function rounded(ctx: CanvasRenderingContext2D, box: TimelineCanvasRect, radius = 4) {
  ctx.beginPath();
  ctx.roundRect(
    box.x,
    box.y,
    box.width,
    box.height,
    Math.min(radius, box.width / 2, box.height / 2),
  );
}
function waveform(
  ctx: CanvasRenderingContext2D,
  item: TimelineCanvasClip,
  width: number,
  cache?: TimelineWaveformPaths,
) {
  const paths = cache?.read(item, width);
  if (paths) {
    const alpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(0, item.bounds.y);
    for (let i = 0; i < paths.length; i++) {
      ctx.globalAlpha = alpha * (i === 0 ? 0.38 : 0.72);
      ctx.fill(paths[i]!);
    }
    ctx.restore();
    return;
  }
  const points = waveformPoints(item, width);
  if (!points.length) return;
  const bottom = item.bounds.y + item.bounds.height - 0.5;
  const alpha = ctx.globalAlpha;
  for (const layer of [
    { scale: 1, opacity: 0.38 },
    { scale: 0.7, opacity: 0.72 },
  ]) {
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, bottom);
    ctx.lineTo(points[0]!.x, bottom - layer.scale * points[0]!.amplitude);
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!,
        current = points[index]!;
      ctx.quadraticCurveTo(
        previous.x,
        bottom - layer.scale * previous.amplitude,
        (previous.x + current.x) / 2,
        bottom - (layer.scale * (previous.amplitude + current.amplitude)) / 2,
      );
    }
    const last = points[points.length - 1]!;
    ctx.lineTo(last.x, bottom - layer.scale * last.amplitude);
    ctx.lineTo(last.x, bottom);
    ctx.closePath();
    ctx.globalAlpha = alpha * layer.opacity;
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
}
function clip(
  ctx: CanvasRenderingContext2D,
  item: TimelineCanvasClip,
  scene: TimelineCanvasScene,
  palette: TimelineCanvasPalette,
  waveforms?: TimelineWaveformPaths,
) {
  const hover = sameHit(scene.hoverHit, item.hit);
  const color = item.mediaKind === "other" ? palette.trackSelected : palette[item.mediaKind];
  // Clip path coordinates stay close to the viewport, including extremely long clips.
  const x = Math.max(-8, item.bounds.x),
    end = Math.min(scene.viewport.width + 8, item.bounds.x + item.bounds.width);
  const bounds = { ...item.bounds, x, width: Math.max(0, end - x) };
  if (!bounds.width) return;
  ctx.save();
  ctx.globalAlpha = item.muted ? 0.45 : 1;
  rounded(ctx, bounds);
  ctx.fillStyle = item.selected ? color : hover ? palette.trackHover : palette.track;
  ctx.fill();
  ctx.strokeStyle = item.selected ? color : palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();
  if (item.kind === "audio") {
    ctx.fillStyle = item.selected ? palette.background : palette.muted;
    waveform(ctx, item, scene.viewport.width, waveforms);
  }
  if (hover || item.selected) {
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = palette.foreground;
    for (const trim of item.trims) {
      const left = trim.kind === "trimStart" || trim.kind === "audioTrimStart";
      const x = left ? item.bounds.x + 3 : item.bounds.x + item.bounds.width - 4;
      if (x >= 0 && x <= scene.viewport.width)
        ctx.fillRect(x, bounds.y + 5, 1, Math.max(1, bounds.height - 10));
    }
  }
  ctx.restore();
}

/** UI decoration only: native Canvas2D commands, no pixel read APIs and no media preparation. */
export function paintTimelineCanvas(
  ctx: CanvasRenderingContext2D,
  scene: TimelineCanvasScene,
  palette: TimelineCanvasPalette,
  glyphOpacity = 1,
  waveforms?: TimelineWaveformPaths,
) {
  const { width, height } = scene.viewport;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  for (const row of scene.rows) {
    if (row.selected) {
      ctx.globalAlpha = 0.045;
      ctx.fillStyle = palette.foreground;
      ctx.fillRect(0, row.y, width, scene.rowHeight);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = palette.border;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, row.y + scene.rowHeight - 1, width, 1);
    ctx.globalAlpha = 1;
    for (const item of row.items) {
      if (item.kind === "clip" || item.kind === "audio") {
        clip(ctx, item, scene, palette, waveforms);
      } else if (item.kind === "easing") {
        const { x, y, width, height } = item.bounds;
        const hover = sameHit(scene.hoverHit, item.hit);
        ctx.strokeStyle = hover ? palette.foreground : palette.muted;
        ctx.globalAlpha = hover ? 0.8 : 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + height / 2);
        ctx.lineTo(x + width - 5, y + height / 2);
        ctx.stroke();
        if (width >= 14 && glyphOpacity > 0) {
          ctx.globalAlpha = glyphOpacity * (hover ? 0.8 : 0.55);
          const middle = x + width / 2;
          ctx.fillStyle = palette.background;
          ctx.fillRect(middle - 7, y + 2, 14, height - 4);
          ctx.beginPath();
          ctx.moveTo(middle - 4, y + height - 5);
          if (item.easing?.type === "hold") {
            ctx.lineTo(middle + 4, y + height - 5);
            ctx.lineTo(middle + 4, y + 5);
          } else
            ctx.bezierCurveTo(middle + 1, y + height - 5, middle - 1, y + 5, middle + 4, y + 5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (item.kind === "key") {
        const { x, y, width, height } = item.bounds;
        const center = x + width / 2,
          middle = y + height / 2;
        const hover = sameHit(scene.hoverHit, item.hit);
        ctx.fillStyle = item.selected ? palette.keySelected : palette.background;
        ctx.strokeStyle = item.selected
          ? palette.keySelected
          : hover
            ? palette.foreground
            : palette.muted;
        ctx.lineWidth = 1.4;
        for (const offset of item.count > 1 ? [3, 0] : [0]) {
          ctx.beginPath();
          ctx.moveTo(center + offset, middle - 4);
          ctx.lineTo(center + 4 + offset, middle);
          ctx.lineTo(center + offset, middle + 4);
          ctx.lineTo(center - 4 + offset, middle);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}
