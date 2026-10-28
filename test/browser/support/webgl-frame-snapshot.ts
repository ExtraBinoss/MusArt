import type { Page } from "@playwright/test";

interface NativeFrame {
  dataUrl: string;
  width: number;
  height: number;
  projectId?: string;
  pageId?: string;
  revision?: string;
}
declare global {
  interface Window {
    __liveWebGLFrame?: NativeFrame;
    __stopLiveWebGLSnapshot?: () => void;
  }
}
/** Test-only native encoding in the draw task, before WebGL clears its buffer. */
export async function installWebGLFrameSnapshot(page: Page) {
  await page.addInitScript(() => {
    const prototype = WebGL2RenderingContext.prototype;
    const elements = prototype.drawElements,
      arrays = prototype.drawArrays,
      instancedElements = prototype.drawElementsInstanced,
      instancedArrays = prototype.drawArraysInstanced;
    const capture = (context: WebGL2RenderingContext) => {
      const canvas = context.canvas;
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.matches(".editor-gpu-scene canvas")) return;
      if (context.getParameter(context.DRAW_FRAMEBUFFER_BINDING) !== null) return;
      window.__liveWebGLFrame = {
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        projectId: canvas.dataset.projectId,
        pageId: canvas.dataset.pageId,
        revision: canvas.dataset.sceneRevision,
      };
    };
    prototype.drawElements = function (this: WebGL2RenderingContext, ...args: Parameters<typeof elements>) {
      elements.apply(this, args); capture(this);
    };
    prototype.drawArrays = function (this: WebGL2RenderingContext, ...args: Parameters<typeof arrays>) {
      arrays.apply(this, args); capture(this);
    };
    prototype.drawElementsInstanced = function (this: WebGL2RenderingContext, ...args: Parameters<typeof instancedElements>) {
      instancedElements.apply(this, args); capture(this);
    };
    prototype.drawArraysInstanced = function (this: WebGL2RenderingContext, ...args: Parameters<typeof instancedArrays>) {
      instancedArrays.apply(this, args); capture(this);
    };
    window.__stopLiveWebGLSnapshot = () => {
      prototype.drawElements = elements;
      prototype.drawArrays = arrays;
      prototype.drawElementsInstanced = instancedElements;
      prototype.drawArraysInstanced = instancedArrays;
    };
  });
}

export async function nativeWebGLFrame(page: Page, projectId: string) {
  await page.waitForFunction(projectId => {
    const frame = window.__liveWebGLFrame,
      canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return frame?.projectId === projectId && frame.pageId === canvas?.dataset.pageId && frame.revision === canvas?.dataset.renderedRevision && frame.width === canvas?.width && frame.height === canvas?.height;
  }, projectId);
  return page.evaluate(() => window.__liveWebGLFrame!);
}
