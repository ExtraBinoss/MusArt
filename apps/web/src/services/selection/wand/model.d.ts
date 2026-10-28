export type SelectionMode = "new" | "add" | "subtract" | "intersect";
export interface WandPreview {
  width: number;
  height: number;
  path: string;
  selected: number;
  simplified: boolean;
}
export type WandRequest =
  | { id: number; type: "source"; data: Uint8ClampedArray; width: number; height: number }
  | {
      id: number;
      type: "preview";
      x: number;
      y: number;
      tolerance: number;
      mode: SelectionMode;
      contiguous: boolean;
    }
  | { id: number; type: "accept" | "invert" | "export" };
export type WandResponse =
  | { id: number; preview: WandPreview }
  | { id: number; mask: { data: Uint8ClampedArray; width: number; height: number } }
  | { id: number; error: string };
export interface PixelSelectionState extends WandPreview {
  layerId: string;
  tolerance: number;
  mode: SelectionMode;
  contiguous: boolean;
  busy: boolean;
  dragging: boolean;
  replacesMask?: boolean;
}
export interface PixelSelectionPort {
  read: () => PixelSelectionState | null;
  subscribe: (listener: () => void) => () => void;
  begin(
    layerId: string,
    x: number,
    y: number,
    tolerance: number,
    mode?: SelectionMode,
    contiguous?: boolean,
  ): Promise<void>;
  update(tolerance: number): Promise<void>;
  accept(): Promise<void>;
  cancel(): void;
  invert(): Promise<void>;
  createMask(): Promise<void>;
  erase(): Promise<void>;
  deselect(): void;
  dispose(): void;
}
