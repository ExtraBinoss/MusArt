import url from "../../../assets/profiles/CRPC6-perceptual-rgb8.bin?url";
import metadata from "../../../assets/profiles/CRPC6-perceptual-rgb8.json";

export const PRINT_PROOF_SIZE = metadata.size;
export const PRINT_PROOF_BYTES = PRINT_PROOF_SIZE ** 3 * 4;
let pending: Promise<Uint8Array<ArrayBuffer>> | undefined;

/** One immutable, bounded CPU table shared by GPU contexts. No image conversion at runtime. */
export function loadPrintProof(): Promise<Uint8Array<ArrayBuffer>> {
  pending ??= fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error("The print color table could not be loaded.");
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length !== PRINT_PROOF_BYTES) throw new Error("Invalid print color table.");
      return data;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
