declare module "harfbuzzjs/hb.js" {
  export default function createModule(options: { wasmBinary: Uint8Array }): Promise<unknown>;
}
declare module "harfbuzzjs/hbjs.js" {
  export default function createAPI(module: unknown): unknown;
}
