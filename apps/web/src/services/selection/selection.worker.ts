import { floodMask } from "./pixel-selection";
import type { SelectionRequest, SelectionResponse } from "./selection";
export async function processSelection(request: SelectionRequest): Promise<SelectionResponse> {
  try {
    if (request.type === "wand")
      return {
        id: request.id,
        result: {
          data: floodMask(
            request.pixels,
            request.width,
            request.height,
            request.x,
            request.y,
            request.tolerance,
          ),
          width: request.width,
          height: request.height,
        },
      };
    const { prepareSam, segmentObject } = await import("./sam");
    if (request.type === "prepare") {
      await prepareSam();
      return { id: request.id, result: null };
    }
    return { id: request.id, result: await segmentObject(request.dataUrl, request.x, request.y) };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}
export async function handleSelection(event: MessageEvent<SelectionRequest>) {
  const response = await processSelection(event.data);
  globalThis.postMessage(
    response,
    "result" in response && response.result ? [response.result.data.buffer as ArrayBuffer] : [],
  );
}
globalThis.onmessage = handleSelection;
