import {
  closeAtlas,
  decodePeaks,
  mountainPath,
} from "../../../../services/motion/audio/bank/geometry";
import type {
  BankAtlas,
  BankClock,
  BankOwner,
  BankPlayback,
  BankPort,
  BankShapeData,
} from "../../../../services/motion/audio/bank/model";
import { BANK_ATLAS_BYTES } from "../../../../services/motion/audio/bank/atlas";
interface Row {
  node: HTMLCanvasElement;
  row: HTMLElement;
  context: CanvasRenderingContext2D;
  path: Path2D | null;
  index: number;
}
interface Claim {
  preset: string;
  playback: BankPlayback;
}

/** One native-clock animation for the active item. Fifteen idle canvases own no frame loops. */
export class BankCanvasPainter {
  private readonly rows = new Map<string, Row>();
  private readonly peaks: readonly (readonly number[])[];
  private atlas: BankAtlas | null = null;
  private generation = 0;
  private frame: number | null = null;
  private claim: Claim | null = null;
  private root: HTMLElement | null = null;
  private width = 128;
  private dpr = 1;
  private neutral = "#888888";
  private active = "#16a34a";
  private closed = false;
  private cleanup: (() => void) | null = null;
  constructor(
    private readonly data: BankShapeData,
    private readonly owner: BankOwner,
    private readonly port: BankPort,
  ) {
    this.peaks = data.shapes.map(decodePeaks);
  }
  register(id: string, node: HTMLCanvasElement, row: HTMLElement) {
    const context = node.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) throw Error("Canvas sound-bank waveforms are unavailable.");
    const index = this.data.shapes.findIndex((shape) => shape.id === id);
    if (index < 0) throw Error("Sound-bank waveform is missing.");
    const entry: Row = { node, row, context, path: null, index };
    this.rows.set(id, entry);
    if (this.root && !this.closed) {
      this.resizeRow(entry);
      if (this.claim?.preset === id && this.frame === null) this.tick();
    }
    return () => {
      if (this.rows.get(id) !== entry) return;
      this.rows.delete(id);
      entry.node.width = 1;
      entry.node.height = 1;
      delete entry.row.dataset.previewActive;
      if (this.claim?.preset === id && this.frame !== null) {
        cancelAnimationFrame(this.frame);
        this.frame = null;
      }
    };
  }
  mount(root: HTMLElement) {
    // React replays layout setup after cleanup in StrictMode. The memoized painter
    // is retained, while child waveform refs register a fresh set of canvases.
    this.cleanup?.();
    this.cleanup = null;
    this.closed = false;
    this.root = root;
    this.refresh(true);
    const resize = new ResizeObserver(() => this.refresh());
    resize.observe(root);
    const theme = new MutationObserver(() => this.refresh());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const resizeWindow = () => this.refresh();
    window.addEventListener("resize", resizeWindow);
    let query: MediaQueryList | null = null;
    const resolution = () => {
      query?.removeEventListener("change", resolution);
      this.refresh();
      query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      query.addEventListener("change", resolution);
    };
    if (typeof matchMedia === "function") resolution();
    this.cleanup = () => {
      resize.disconnect();
      theme.disconnect();
      window.removeEventListener("resize", resizeWindow);
      query?.removeEventListener("change", resolution);
    };
  }
  private refresh(force = false) {
    if (this.closed || !this.root) return;
    const first = this.rows.values().next().value as Row | undefined;
    if (!first) return;
    const style = getComputedStyle(first.node),
      measured = first.node.clientWidth,
      ratio = devicePixelRatio,
      dpr = Number.isFinite(ratio) && ratio > 0 ? Math.min(4, Math.max(0.5, ratio)) : 1,
      // Both gray/green atlas planes and every local fallback share this limit.
      // Leave one physical pixel of rounding margin before worker-side ceil().
      maximumWidth = Math.max(
        1,
        Math.floor(
          (BANK_ATLAS_BYTES / (Math.ceil(16 * dpr) * this.data.shapes.length * 8) - 1) / dpr,
        ),
      ),
      width = Math.min(maximumWidth, Number.isFinite(measured) && measured > 0 ? measured : 128),
      neutral = style.color,
      active = style.outlineColor;
    if (
      !force &&
      width === this.width &&
      dpr === this.dpr &&
      neutral === this.neutral &&
      active === this.active
    )
      return;
    this.width = width;
    this.dpr = dpr;
    this.neutral = neutral;
    this.active = active;
    const generation = ++this.generation;
    closeAtlas(this.atlas);
    this.atlas = null;
    for (const row of this.rows.values()) this.resizeRow(row);
    void this.port
      .atlas(this.owner, {
        shapes: this.data.shapes,
        width,
        height: 16,
        dpr,
        palette: { neutral, active },
      })
      .then(
        (atlas) => {
          if (this.closed || generation !== this.generation) {
            closeAtlas(atlas);
            return;
          }
          this.atlas = atlas;
          for (const [id, row] of this.rows) this.paint(row, this.progress(id));
        },
        () => {
          /* Genuine precomputed paths remain visible if optional bitmap preparation is unavailable. */
        },
      );
  }
  private resizeRow(row: Row) {
    const width = Math.ceil(this.width * this.dpr),
      height = Math.ceil(16 * this.dpr);
    if (row.node.width !== width || row.node.height !== height || !row.path) {
      row.node.width = width;
      row.node.height = height;
      row.path = mountainPath(this.peaks[row.index]!, width, height);
    }
    this.paint(row, this.progress(this.data.shapes[row.index]!.id));
    row.node.dataset.waveformReady = "true";
  }
  private progress(id: string) {
    if (this.claim?.preset !== id) return 0;
    const clock = this.port.clock(this.owner, this.claim.playback);
    return clock ? Math.max(0, Math.min(1, clock.elapsed / clock.duration)) : 0;
  }
  private paint(row: Row, progress: number) {
    const { node, context, path, index } = row,
      w = node.width,
      h = node.height;
    context.clearRect(0, 0, w, h);
    if (this.atlas)
      context.drawImage(
        this.atlas.neutral,
        0,
        index * this.atlas.height,
        this.atlas.width,
        this.atlas.height,
        0,
        0,
        w,
        h,
      );
    else if (path) {
      context.fillStyle = this.neutral;
      context.fill(path);
    }
    if (progress <= 0) return;
    context.save();
    context.beginPath();
    context.rect(0, 0, w * progress, h);
    context.clip();
    if (this.atlas)
      context.drawImage(
        this.atlas.active,
        0,
        index * this.atlas.height,
        this.atlas.width,
        this.atlas.height,
        0,
        0,
        w,
        h,
      );
    else if (path) {
      context.fillStyle = this.active;
      context.fill(path);
    }
    context.restore();
  }
  select(preset: string | null, playback?: BankPlayback) {
    if (this.closed) return;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.claim) {
      const old = this.rows.get(this.claim.preset);
      if (old) {
        delete old.row.dataset.previewActive;
        this.paint(old, 0);
      }
    }
    this.claim = preset && playback ? { preset, playback } : null;
    const row = preset ? this.rows.get(preset) : null;
    if (row) row.row.dataset.previewActive = "true";
  }
  start(preset: string, playback: BankPlayback) {
    this.select(preset, playback);
    this.tick();
  }
  private tick = () => {
    this.frame = null;
    if (this.closed || !this.claim) return;
    const clock: BankClock | null = this.port.clock(this.owner, this.claim.playback),
      row = this.rows.get(this.claim.preset);
    if (!row) return;
    if (!clock) {
      this.paint(row, 0);
      return;
    }
    this.paint(row, Math.max(0, Math.min(1, clock.elapsed / clock.duration)));
    if (clock.playing) this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.cleanup?.();
    this.cleanup = null;
    closeAtlas(this.atlas);
    this.atlas = null;
    for (const row of this.rows.values()) {
      row.node.width = 1;
      row.node.height = 1;
      delete row.row.dataset.previewActive;
    }
    this.rows.clear();
    this.root = null;
    this.claim = null;
  }
}
