import { useLayoutEffect, useRef } from "react";
import type { BankCanvasPainter } from "./bank/canvas";

/** Precomputed source shape is painted before the first frame; no SVG or per-item RAF. */
export function SfxWaveform({ id, painter }: { id: string; painter: BankCanvasPainter }) {
  const node = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = node.current,
      row = canvas?.parentElement;
    if (canvas && row) return painter.register(id, canvas, row);
  }, [id, painter]);
  return <canvas ref={node} className="motion-sfx-waveform" style={{ height: 16 }} aria-hidden />;
}
