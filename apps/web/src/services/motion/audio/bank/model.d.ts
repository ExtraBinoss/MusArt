export interface BankShape {
  readonly id: string;
  readonly revision: string;
  readonly frames: number;
  /** Little-endian unsigned 16-bit source peaks, base64 encoded by the headless generator. */
  readonly peaks: string;
}
export interface BankOwner {
  readonly kind: "sound-bank";
  readonly token: symbol;
}
export interface BankPlayback {
  readonly kind: "bank-playback";
  readonly token: symbol;
}
export interface BankClock {
  readonly preset: string;
  readonly elapsed: number;
  readonly duration: number;
  readonly playing: boolean;
}
export interface BankShapeData {
  readonly version: 1;
  readonly recipeVersion: number;
  readonly sampleRate: 48000;
  readonly bins: number;
  readonly shapes: readonly BankShape[];
}
export interface BankPcm {
  readonly preset: string;
  readonly revision: string;
  readonly blob: Blob;
  readonly pcm: Float32Array<ArrayBuffer>;
  readonly frames: number;
}
export interface BankPalette {
  readonly neutral: string;
  readonly active: string;
}
export interface BankAtlas {
  readonly neutral: ImageBitmap;
  readonly active: ImageBitmap;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
export type BankJob =
  | { readonly id: number; readonly type: "prepare"; readonly preset: string }
  | {
      readonly id: number;
      readonly type: "atlas";
      readonly shapes: readonly BankShape[];
      readonly width: number;
      readonly height: number;
      readonly dpr: number;
      readonly palette: BankPalette;
    };
export type BankReply =
  | { readonly id: number; readonly type: "pcm"; readonly value: BankPcm }
  | { readonly id: number; readonly type: "atlas"; readonly value: BankAtlas }
  | { readonly id: number; readonly type: "error"; readonly message: string };
export interface BankPort {
  open(owner: BankOwner, data: BankShapeData): void;
  close(owner: BankOwner): void;
  preview(
    owner: BankOwner,
    playback: BankPlayback,
    preset: string,
    interactive: boolean,
  ): Promise<void>;
  stop(owner: BankOwner, playback?: BankPlayback): void;
  clock(owner: BankOwner, playback: BankPlayback): BankClock | null;
  atlas(
    owner: BankOwner,
    input: Omit<Extract<BankJob, { type: "atlas" }>, "id" | "type">,
  ): Promise<BankAtlas>;
}
