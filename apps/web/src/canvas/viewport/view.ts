export interface Point {
  x: number;
  y: number;
}
export interface View {
  x: number;
  y: number;
  zoom: number;
}
export const INITIAL_VIEW: View = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const WHEEL_PAN_SPEED = 0.5;
export const WHEEL_ZOOM_GAIN = 0.002;
export const MAX_WHEEL_ZOOM_PIXELS = 80;

export function wheelZoomFactor(delta: number, mode: number, viewport: number): number {
  const pixels = wheelPixels(delta, mode, viewport);
  return Number.isFinite(pixels)
    ? Math.exp(
        -Math.max(-MAX_WHEEL_ZOOM_PIXELS, Math.min(MAX_WHEEL_ZOOM_PIXELS, pixels)) *
          WHEEL_ZOOM_GAIN,
      )
    : 1;
}

/** Keep a useful part of the page in reach, with a small workspace gutter. */
export function constrainView(
  view: View,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): View {
  const limit = (extent: number, available: number) =>
    Math.max(0, (extent * view.zoom - available) / 2) + Math.min(240, available * 0.3);
  const x = Math.max(
    -limit(size.width, viewport.width),
    Math.min(limit(size.width, viewport.width), view.x),
  );
  const y = Math.max(
    -limit(size.height, viewport.height),
    Math.min(limit(size.height, viewport.height), view.y),
  );
  return x === view.x && y === view.y ? view : { ...view, x, y };
}

export function zoomAt(view: View, factor: number, anchor: Point): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    zoom,
  };
}

export function pan(view: View, deltaX: number, deltaY: number): View {
  return { ...view, x: view.x - deltaX, y: view.y - deltaY };
}

export function clientToPage(
  client: Point,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  view: View,
  size: { width: number; height: number },
): Point {
  return {
    x: (client.x - rect.left - rect.width / 2 - view.x) / view.zoom + size.width / 2,
    y: (client.y - rect.top - rect.height / 2 - view.y) / view.zoom + size.height / 2,
  };
}

export function wheelPixels(delta: number, mode: number, viewport: number): number {
  return delta * (mode === 1 ? 16 : mode === 2 ? viewport : 1);
}

export function fitView(
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): View {
  return {
    x: 0,
    y: 0,
    zoom: Math.min(
      1,
      Math.max(
        MIN_ZOOM,
        Math.min((viewport.width - 160) / size.width, (viewport.height - 160) / size.height),
      ),
    ),
  };
}
