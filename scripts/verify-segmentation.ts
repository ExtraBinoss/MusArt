import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const baseURL = process.env.MUSART_BASE_URL ?? "http://127.0.0.1:6100";
const imageURL =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg";
const started = performance.now();
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  baseURL,
  model: "Xenova/slimsam-77-uniform",
  revision: "5850ab45f587c112167512ffef949107115e26a0",
  imageSource: imageURL,
  notes: [
    "Real production SAM module and real pinned ONNX weights. No model/inference mocks.",
    "Headless Chromium with Vulkan enabled. Adapter information is recorded separately; timings are environment-specific.",
  ],
  attempts: [],
};
const errors: string[] = [];
const requests: Array<{ url: string; status?: number; failure?: string }> = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 1000));
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().startsWith("https://")) {
    const url = new URL(response.url());
    requests.push({ url: url.origin + url.pathname, status: response.status() });
  }
});
page.on("requestfailed", (request) => {
  const url = new URL(request.url());
  requests.push({
    url: url.origin + url.pathname,
    failure: request.failure()?.errorText ?? "Unknown failure",
  });
});
await page.route(`${baseURL}/__segmentation_check__`, (route) =>
  route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><title>MusArt real segmentation verification</title></html>",
  }),
);
await page.goto(`${baseURL}/__segmentation_check__`);
report.adapter = await page.evaluate(async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return null;
  const { vendor, architecture, device, description } = adapter.info;
  return { vendor, architecture, device, description };
});
await page.exposeFunction("samProgress", (phase: unknown) =>
  console.log(JSON.stringify({ segmentation: phase })),
);
const workerSource = `
const moduleURL=${JSON.stringify(`${baseURL}/src/services/selection/sam.ts`)};
self.onmessage=async({data})=>{
 try{
  if(data.forceWasm){
   const original=navigator;
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:new Proxy(original,{has:(target,key)=>key==='gpu'?false:Reflect.has(target,key),get:(target,key)=>key==='gpu'?undefined:Reflect.get(target,key,target)})});
  }
  const {prepareSam,segmentObject}=await import(moduleURL);
  const begin=performance.now();
  self.postMessage({phase:'preparing',mode:data.mode});
  const loaded=await prepareSam();
  const prepared=performance.now();
  self.postMessage({phase:'model-ready',mode:data.mode,prepareMs:prepared-begin});
  const masks=[];
  for(const point of [[340,250],[345,255],[350,260]]){
   const start=performance.now();
   const result=await segmentObject(data.image,point[0],point[1]);
   let selected=0,transparent=0;const histogram={};
   for(let index=3;index<result.data.length;index+=4){const alpha=result.data[index];if(alpha>0)selected++;else transparent++;histogram[alpha]=(histogram[alpha]??0)+1;}
   if(result.data.length!==result.width*result.height*4||selected===0||transparent===0)throw new Error('Real model returned invalid, empty or fully opaque mask');
   masks.push({point,width:result.width,height:result.height,pixels:result.width*result.height,selected,transparent,alphaHistogram:histogram,durationMs:performance.now()-start});
   self.postMessage({phase:'mask-ready',mode:data.mode,index:masks.length,durationMs:masks.at(-1).durationMs});
  }
  const sessions=Object.entries(loaded.model.sessions??{}).map(([name,session])=>({name,config:session.config??null}));
  const cache=await caches.open('transformers-cache');
  const cacheKeys=(await cache.keys()).map(request=>{const url=new URL(request.url);return url.origin+url.pathname;});
  self.postMessage({done:true,result:{mode:data.mode,forceWasm:data.forceWasm,prepareMs:prepared-begin,totalMs:performance.now()-begin,masks,sessions,cacheKeys}});
 }catch(error){self.postMessage({done:true,error:error instanceof Error?{message:error.message,stack:error.stack}:String(error)});}
};`;
try {
  const imageResponse = await fetch(imageURL);
  if (!imageResponse.ok) throw new Error(`Official image unavailable: ${imageResponse.status}`);
  const image = `data:image/jpeg;base64,${Buffer.from(await imageResponse.arrayBuffer()).toString("base64")}`;
  report.imageDataUrlCharacters = image.length;
  const run = async (mode: string, forceWasm: boolean) => {
    console.log(JSON.stringify({ segmentation: { phase: "run-start", mode } }));
    const result = await page.evaluate(
      async ({ source, image, mode, forceWasm }) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
          const worker = new Worker(url, { type: "module" });
          const timer = setTimeout(() => {
            worker.terminate();
            URL.revokeObjectURL(url);
            reject(new Error("Real segmentation exceeded ten minutes"));
          }, 600000);
          worker.onmessage = ({ data }) => {
            if (!data.done) {
              const bridge = (window as unknown as { samProgress: (phase: unknown) => void })
                .samProgress;
              bridge(data);
              return;
            }
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            if (data.error) resolve({ mode, ok: false, error: data.error });
            else resolve({ ok: true, ...data.result });
          };
          worker.onerror = (event) => {
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            reject(new Error(event.message));
          };
          worker.postMessage({ image, mode, forceWasm });
        }),
      { source: workerSource, image, mode, forceWasm },
    );
    (report.attempts as unknown[]).push(result);
    await writeFile(
      "artifacts/segmentation.json",
      JSON.stringify({ ...report, requests, consoleErrors: errors }, null, 2),
    );
    console.log(JSON.stringify({ segmentation: { phase: "run-complete", mode, ok: result.ok } }));
    return result;
  };
  await mkdir("artifacts", { recursive: true });
  const gpu = await run("webgpu-cold-and-warm", false);
  if (!gpu.ok) throw new Error(`WebGPU preparation/inference failed: ${JSON.stringify(gpu.error)}`);
  let blocked = 0;
  await context.route("https://**/*", (route) => {
    blocked++;
    return route.abort("internetdisconnected");
  });
  const wasm = await run("wasm-fresh-worker-remote-network-blocked", true);
  report.blockedRemoteRequests = blocked;
  if (!wasm.ok)
    throw new Error(
      `Cached WASM inference failed with remote network blocked: ${JSON.stringify(wasm.error)}`,
    );
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure =
    error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  process.exitCode = 1;
} finally {
  report.totalMs = performance.now() - started;
  report.requests = requests;
  report.consoleErrors = errors;
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/segmentation.json", JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      segmentation: {
        phase: "finished",
        ok: report.ok,
        totalMs: report.totalMs,
        report: "artifacts/segmentation.json",
        failure: report.failure ?? null,
      },
    }),
  );
}
