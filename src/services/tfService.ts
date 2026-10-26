
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

let initializedBackend: string | null = null;
let initializingPromise: Promise<string> | null = null;

/**
 * 1. DETECT BACKEND TANPA MEMICU ERROR LOG
 */
function detectBestBackend(): "webgl" | "cpu" {
  try {
    const canvas = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const gl =
      canvas.getContext("webgl2", options) as WebGL2RenderingContext | null ||
      canvas.getContext("webgl", options) as WebGLRenderingContext | null ||
      canvas.getContext("experimental-webgl", options) as WebGLRenderingContext | null;

    if (gl && typeof (gl as any).getParameter === 'function') {
      // Real check if we can actually get a parameter from the context
      const vendor = (gl as any).getParameter((gl as any).VENDOR);
      if (vendor && vendor !== "Software Rendering") {
        return "webgl";
      }
    }
  } catch (e) {}

  console.warn("[VISION] WebGL context failed or software-only. Falling back to CPU.");
  return "cpu";
}

/**
 * 2. HARD LOCK BACKEND (NO RETRY, NO CHAOS)
 */
export async function initTFStable(): Promise<string> {
  if (initializedBackend) return initializedBackend;
  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    const backend = detectBestBackend();

    try {
      await tf.setBackend(backend);
      await tf.ready();
      initializedBackend = backend;
      console.log("[VISION] TF Backend Locked:", backend);
      return backend;
    } catch (e) {
      // Ultimate fallback if even detection fails somehow
      await tf.setBackend("cpu");
      await tf.ready();
      initializedBackend = "cpu";
      return "cpu";
    } finally {
      initializingPromise = null;
    }
  })();

  return initializingPromise;
}

/**
 * Aliasing initTF for backward compatibility
 */
export const initTF = initTFStable;

/**
 * 3. SILENT MODE (REDUCE NOISE)
 */
export function suppressTFLogs() {
  const originalWarn = console.warn;

  console.warn = (...args) => {
    const msg = args[0]?.toString?.() || "";

    if (
      msg.includes("webgl") ||
      msg.includes("WebGL") ||
      msg.includes("WebGPU") ||
      msg.includes("backend") ||
      msg.includes("features")
    ) {
      return;
    }

    originalWarn(...args);
  };
}

/**
 * Ensures a specific backend, mostly for debugging.
 */
export async function forceBackend(name: 'webgl' | 'cpu') {
  try {
    await tf.setBackend(name);
    await tf.ready();
    initializedBackend = name;
  } catch (e) {
    console.error(`Failed to force backend ${name}`, e);
  }
}
