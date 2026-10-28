import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  LinearSRGBColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  WebGPURenderer,
} from "three/webgpu";
import { useTranslation } from "react-i18next";
import type { SceneController } from "../session/scene-controller";
import type { FontResolver } from "@musart/render";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { PlaneResources } from "./plane-resources";
import { FiberTimerClock } from "./fiber-timer";
import "../../state/i18n/errors/messages";
import "./loading.css";

export interface SceneProps {
  controller: SceneController;
  onError?: (message: string) => void;
  zoom?: number;
  fontResolver?: FontResolver;
}
export async function makeRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<WebGPURenderer> {
  function create(forceWebGL = false) {
    if (canvas instanceof HTMLCanvasElement)
      canvas.dataset.rendererInstances = String(Number(canvas.dataset.rendererInstances ?? 0) + 1);
    return new WebGPURenderer({
      canvas,
      alpha: true,
      antialias: false,
      ...(forceWebGL ? { forceWebGL: true } : {}),
    });
  }
  let renderer = create();
  try {
    await renderer.init();
  } catch {
    await renderer.dispose();
    renderer = create(true);
    try {
      await renderer.init();
    } catch (error) {
      await renderer.dispose();
      throw error;
    }
  }
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0, 0);
  return renderer;
}
export function CompositionPlane({ controller, onError, zoom = 1, fontResolver }: SceneProps) {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const invalidate = useThree((state) => state.invalidate);
  const setDpr = useThree((state) => state.setDpr);
  const clock = useThree((state) => state.clock);
  useEffect(() => (clock instanceof FiberTimerClock ? clock.retain(document) : undefined), [clock]);
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const resources = useMemo(
    () => new PlaneResources(renderer, fontResolver),
    [renderer, fontResolver],
  );
  useEffect(() => {
    const release = resources.activate(
      scene,
      camera,
      invalidate,
      (message) => onErrorRef.current?.(message),
      (scale) => setDpr(scale),
    );
    const update = () => {
      const { page, assets } = controller.read();
      resources.submit(page, assets);
    };
    const unsubscribe = controller.subscribe(update);
    update();
    return () => {
      unsubscribe();
      release();
    };
  }, [resources, scene, camera, invalidate, controller, setDpr]);
  useEffect(() => {
    const timer = setTimeout(
      () => resources.setDensity(zoom * (window.devicePixelRatio || 1)),
      140,
    );
    return () => clearTimeout(timer);
  }, [zoom, resources]);
  useFrame(() => resources.present());
  return <primitive object={resources.mesh} dispose={null} />;
}
class GpuBoundary extends Component<
  {
    children: ReactNode;
    onError?: (message: string) => void;
    fallback: string;
    describeError: (message: string) => string;
  },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError?.(this.props.describeError(error.message));
  }
  render() {
    if (this.state.error)
      return (
        <div className="gpu-error" role="alert">
          {this.props.fallback}
        </div>
      );
    return this.props.children;
  }
}
export const EditorScene = memo(function EditorScene({
  controller,
  onError,
  zoom = 1,
  fontResolver,
}: SceneProps) {
  const [{ page }] = useState(() => controller.read());
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  useRenderMetrics(element);
  return (
    <GpuBoundary
      onError={onError}
      fallback={t("errors:gpuUnavailable")}
      describeError={(message) => t("errors:gpuError", { message })}
    >
      <div className="editor-gpu-scene" ref={element}>
        <Canvas
          orthographic
          frameloop="demand"
          shadows={{ enabled: false, type: PCFShadowMap }}
          resize={{ offsetSize: true }}
          dpr={1}
          flat
          linear
          camera={{
            position: [0, 0, 10],
            zoom: 1,
            near: 0.1,
            far: 100,
            left: -page.width / 2,
            right: page.width / 2,
            top: page.height / 2,
            bottom: -page.height / 2,
            manual: true,
          }}
          gl={async (props) => makeRenderer(props.canvas as HTMLCanvasElement)}
          style={{ width: "100%", height: "100%" }}
        >
          <CompositionPlane
            controller={controller}
            onError={onError}
            zoom={zoom}
            fontResolver={fontResolver}
          />
        </Canvas>
        <div className="canvas-loading" role="status" aria-label={t("loadingCanvas")}>
          <span className="canvas-loading-glow" aria-hidden="true" />
        </div>
      </div>
    </GpuBoundary>
  );
});
