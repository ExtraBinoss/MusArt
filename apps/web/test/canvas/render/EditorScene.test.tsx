import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { changeLanguage } from "../../../src/state/i18n";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Composition,
} from "@musart/core";
import {
  DataTexture,
  LinearSRGBColorSpace,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PCFShadowMap,
  Scene,
  Texture,
} from "three/webgpu";
import {
  CompositionPlane,
  EditorScene,
  makeRenderer,
} from "../../../src/canvas/render/EditorScene";
import { FiberTimerClock } from "../../../src/canvas/render/fiber-timer";

const gpu = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  clear: vi.fn(),
  constructors: vi.fn(),
  compile: vi.fn(),
  invalidate: vi.fn(),
  render: vi.fn(),
  compositorDispose: vi.fn(),
  compositorConstruct: vi.fn(),
  frame: null as (() => void) | null,
  framePriority: undefined as number | undefined,
  state: {} as Record<string, unknown>,
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
  useThree: (selector: (state: Record<string, unknown>) => unknown) => selector(gpu.state),
  useFrame: (callback: () => void, priority?: number) => {
    gpu.framePriority = priority;
    gpu.frame = callback;
  },
}));
vi.mock("@musart/render", () => ({
  GpuCompositor: class {
    constructor() {
      gpu.compositorConstruct();
    }
    render = gpu.render;
    dispose = gpu.compositorDispose;
    retainedFrame = () => null;
    releasePresentation = () => {};
    stats = () => ({ passes: 1, readbacks: 0, targets: 2, uploads: 1, cacheBytes: 100 });
  },
}));
vi.mock("three/webgpu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three/webgpu")>();
  return {
    ...actual,
    WebGPURenderer: class {
      constructor(options: unknown) {
        gpu.constructors(options);
      }
      init = gpu.init;
      dispose = gpu.dispose;
      setClearColor = gpu.clear;
      toneMapping = 0;
    },
  };
});
function canvas() {
  return document.createElement("canvas");
}
function drawn() {
  const scene = gpu.state.scene as Scene;
  Reflect.apply(scene.onAfterRender, scene, [gpu.state.gl, scene, gpu.state.camera, null]);
}
function page(width = 300, height = 200) {
  return createPage({ width, height });
}
function source(document = page()) {
  const engine = new EditorEngine(createProject({ pages: [document] }));
  return { engine, controller: new SceneController(engine, EMPTY_PREVIEW_SOURCE) };
}
beforeEach(() => {
  gpu.init.mockReset().mockResolvedValue(undefined);
  gpu.dispose.mockReset().mockResolvedValue(undefined);
  gpu.clear.mockClear();
  gpu.constructors.mockClear();
  gpu.compile.mockReset().mockResolvedValue(undefined);
  gpu.invalidate.mockClear();
  gpu.compositorDispose.mockReset().mockResolvedValue(undefined);
  gpu.compositorConstruct.mockReset();
  gpu.render.mockReset().mockImplementation(async (page: Composition) => ({
    texture: new Texture(),
    width: page.width,
    height: page.height,
  }));
  gpu.frame = null;
  gpu.framePriority = undefined;
  vi.mocked(Canvas)
    .mockReset()
    .mockImplementation(({ children }) => <>{children}</>);
  const element = canvas();
  gpu.state = {
    invalidate: gpu.invalidate,
    setDpr: vi.fn(),
    clock: new FiberTimerClock(),
    gl: {
      domElement: element,
      setDrawingBufferSize: vi.fn((width: number, height: number) => {
        element.width = width;
        element.height = height;
      }),
      backend: {},
      compileAsync: gpu.compile,
      getRenderTarget: vi.fn(() => null),
    },
    scene: new Scene(),
    camera: new OrthographicCamera(),
  };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("R3F direct WebGPU scene lifetime", () => {
  it("acknowledges the requested logical font only after its matching display draw", async () => {
    const text = createLayer("text", { fontFamily: "Inter", fontWeight: 700 });
    const input = source(createPage({ layers: [text] }));
    const view = render(<CompositionPlane controller={input.controller} />);
    await waitFor(() => expect(gpu.invalidate).toHaveBeenCalledOnce());
    act(drawn);
    const port = input.controller.fontPresentation;
    act(() =>
      input.engine.execute({
        type: "updateLayers",
        ids: [text.id],
        patch: { fontFamily: "Arimo" },
      }),
    );
    const ticket = port.request({
      fontId: "arimo",
      layerId: text.id,
      family: "Arimo",
      weight: 700,
    });
    await waitFor(() => expect(gpu.invalidate).toHaveBeenCalledTimes(2));
    expect(port.read()).toMatchObject({ ticket, status: "pending" });
    act(drawn);
    expect(port.read()).toMatchObject({ ticket, status: "ready" });
    const next = port.request({ layerId: text.id, family: "Tinos", weight: 700 });
    act(drawn);
    expect(port.read()).toMatchObject({ ticket: next, status: "pending" });
    act(() => input.controller.setGesture([{ layerId: text.id, patch: { fontFamily: "Tinos" } }]));
    await waitFor(() => expect(gpu.invalidate).toHaveBeenCalledTimes(3));
    expect(port.read().status).toBe("pending");
    act(drawn);
    expect(port.read().status).toBe("ready");
    view.unmount();
    expect(port.read()).toMatchObject({ available: false, status: "unavailable" });
    port.cancel(next);
  });
  it("awaits WebGPURenderer with an explicit WebGL retry on initialization failure", async () => {
    const target = canvas();
    const renderer = await makeRenderer(target);
    expect(renderer.outputColorSpace).toBe(LinearSRGBColorSpace);
    expect(gpu.constructors).toHaveBeenCalledWith({
      canvas: target,
      alpha: true,
      antialias: false,
    });
    expect(gpu.clear).toHaveBeenCalledWith(0, 0);
    gpu.init.mockRejectedValueOnce(new Error("adapter unavailable"));
    await makeRenderer(target);
    expect(gpu.constructors).toHaveBeenLastCalledWith({
      canvas: target,
      alpha: true,
      antialias: false,
      forceWebGL: true,
    });
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
  it("rejects total GPU initialization failure", async () => {
    gpu.init.mockRejectedValueOnce(new Error("webgpu")).mockRejectedValueOnce(new Error("webgl"));
    await expect(makeRenderer(canvas())).rejects.toThrow("webgl");
    expect(gpu.dispose).toHaveBeenCalledTimes(2);
  });
  it("keeps the R3F renderer and display resources stable while resizing the orthographic frustum", async () => {
    const disposeMap = vi.spyOn(DataTexture.prototype, "dispose");
    const disposeMaterial = vi.spyOn(MeshBasicNodeMaterial.prototype, "dispose");
    const disposeGeometry = vi.spyOn(PlaneGeometry.prototype, "dispose");
    const original = page();
    const input = source(original);
    const { unmount } = render(<EditorScene controller={input.controller} />);
    await waitFor(() => expect(gpu.invalidate).toHaveBeenCalled());
    act(drawn);
    const props = vi.mocked(Canvas).mock.calls[0]![0];
    expect(props.frameloop).toBe("demand");
    expect(props.shadows).toEqual({ enabled: false, type: PCFShadowMap });
    expect(props.resize).toEqual({ offsetSize: true });
    expect(props.linear).toBe(true);
    expect(props.camera).toEqual(
      expect.objectContaining({ left: -150, right: 150, top: 100, bottom: -100, manual: true }),
    );
    if (typeof props.gl !== "function") throw new Error("Expected asynchronous renderer factory");
    await props.gl({ canvas: canvas() });
    expect(gpu.init).toHaveBeenCalled();
    const renderer = gpu.state.gl as { domElement: HTMLCanvasElement };
    expect(renderer.domElement.dataset.rendererReady).toBe("true");
    expect(renderer.domElement.dataset.backend).toBe("webgpu");
    act(() => input.engine.execute({ type: "updatePage", patch: { width: 600, height: 500 } }));
    await waitFor(() =>
      expect(JSON.parse(renderer.domElement.dataset.gpuStats!).completed).toBe(2),
    );
    act(drawn);
    const camera = gpu.state.camera as OrthographicCamera;
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-300, 300, 250, -250]);
    expect(gpu.compile).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(disposeMap).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(gpu.compositorDispose).toHaveBeenCalledOnce();
  });
  it("tags WebGL fallback, reports asynchronous compositor errors and catches render boundaries", async () => {
    const renderer = gpu.state.gl as { backend: Record<string, unknown> };
    renderer.backend.isWebGLBackend = true;
    gpu.render.mockRejectedValueOnce("pipeline lost");
    const onError = vi.fn();
    render(<CompositionPlane controller={source().controller} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("pipeline lost", "pipeline lost"));
    cleanup();
    vi.mocked(Canvas).mockImplementation(() => {
      throw new Error("device lost");
    });
    render(<EditorScene controller={source().controller} onError={onError} />);
    expect(screen.getByRole("alert")).toHaveTextContent("GPU est indisponible");
    expect(onError).toHaveBeenCalledWith("Rendu GPU indisponible : device lost");
  });
  it("waits for a pending compositor job before releasing GPU resources after unmount", async () => {
    let complete:
      | ((value: { texture: Texture; width: number; height: number }) => void)
      | undefined;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const dispose = vi.spyOn(DataTexture.prototype, "dispose");
    const { unmount } = render(<CompositionPlane controller={source().controller} />);
    await waitFor(() => expect(gpu.render).toHaveBeenCalled());
    unmount();
    expect(dispose).not.toHaveBeenCalled();
    await act(async () => {
      complete?.({ texture: new Texture(), width: 300, height: 200 });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("translates a GPU boundary failure without losing the renderer diagnostic", async () => {
    await changeLanguage("en");
    try {
      vi.mocked(Canvas).mockImplementation(() => {
        throw new Error("device lost");
      });
      const onError = vi.fn();
      render(<EditorScene controller={source().controller} onError={onError} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "GPU rendering is unavailable. Reload to try again.",
      );
      expect(onError).toHaveBeenCalledWith("GPU rendering unavailable: device lost");
      await act(() => changeLanguage("fr"));
      expect(screen.getByRole("alert")).toHaveTextContent("Le rendu GPU est indisponible");
    } finally {
      await changeLanguage("fr");
    }
  });
  it("retains the actual drawing density in Fiber's resize props without a React state update", async () => {
    const input = source(page(192, 140));
    render(<EditorScene controller={input.controller} zoom={4} />);
    const retained = vi.mocked(Canvas).mock.calls[0]![0].dpr;
    expect(retained).toEqual([1, 1]);
    await waitFor(() => expect(gpu.state.setDpr).toHaveBeenLastCalledWith(4));
    expect(retained).toEqual([4, 4]);
    if (!Array.isArray(retained)) throw new Error("Expected retained density bounds");
    // This is the same retained last.dpr configuration used by Fiber on viewport resize.
    const resizeRatio = Math.max(retained[0], Math.min(retained[1], 1));
    expect(192 * resizeRatio).toBe(768);
    expect(vi.mocked(Canvas)).toHaveBeenCalledOnce();
    expect(gpu.frame).toBeTypeOf("function");
    expect(gpu.framePriority).toBe(-1);
  });
  it("prepares exact frame texels before Fiber renders, including a later external resize", async () => {
    const input = source(page(778, 17));
    gpu.render.mockResolvedValueOnce({ texture: new Texture(), width: 159, height: 4 });
    render(<CompositionPlane controller={input.controller} />);
    await waitFor(() => expect(gpu.invalidate).toHaveBeenCalled());
    const renderer = gpu.state.gl as {
      domElement: HTMLCanvasElement;
      setDrawingBufferSize: ReturnType<typeof vi.fn>;
    };
    renderer.domElement.width = 158;
    renderer.domElement.height = 3;
    act(() => gpu.frame?.());
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(159, 4, 1);
    act(() => gpu.frame?.());
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    renderer.domElement.width = 158;
    act(() => gpu.frame?.());
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Canvas)).not.toHaveBeenCalled();
  });
  it("releases a presentation lease and resources if activation throws before effect cleanup exists", async () => {
    const input = source(),
      onError = vi.fn();
    gpu.compositorConstruct.mockImplementationOnce(() => {
      throw new Error("Constructor failed");
    });
    render(<EditorScene controller={input.controller} onError={onError} />);
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Constructor failed")),
    );
    expect(input.controller.presentation.read().available).toBe(false);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
