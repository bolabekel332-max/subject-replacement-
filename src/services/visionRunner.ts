
import { runPoseEngine, PoseResult } from "./poseService";
import { autoMask, MaskResult } from "./maskService";
import { DepthResult } from "./depthService";
import { DetectionResult } from "./detectionService";
import { initTFStable } from "./tfService";
import { runUnifiedAnalysis } from "./unifiedAnalysisService";

// In-memory cache for /api/fetch-image-base64 (10 minutes TTL, max 50 entries LRU)
const FETCH_IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

interface CachedImageData {
  base64: string;
  mimeType: string;
  timestamp: number;
  etag?: string;
  lastModified?: string;
}

const fetchImageBase64Cache = new Map<string, CachedImageData>();

function touchLRU(key: string, data: CachedImageData) {
  fetchImageBase64Cache.delete(key);
  fetchImageBase64Cache.set(key, data);
  if (fetchImageBase64Cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = fetchImageBase64Cache.keys().next().value;
    if (oldestKey) {
      fetchImageBase64Cache.delete(oldestKey);
    }
  }
}

/**
 * UNIVERSAL IMAGE NORMALIZER V2 (With Early Resizing)
 * Downscales images early to prevent memory issues in TF.js and heavy pixel ops.
 */
export async function normalizeImageInput(input: File | string, maxDim: number = 1024): Promise<string> {
  let src = typeof input === "string" ? input : await fileToBase64(input);
  
  if (typeof input === "string" && input.startsWith("http")) {
    const urlKey = input;
    const cached = fetchImageBase64Cache.get(urlKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp < FETCH_IMAGE_CACHE_TTL_MS)) {
      touchLRU(urlKey, cached);
      src = `data:${cached.mimeType || 'image/jpeg'};base64,${cached.base64}`;
    } else {
      try {
        const payload: Record<string, string> = { url: input };
        if (cached?.etag) payload.ifNoneMatch = cached.etag;
        if (cached?.lastModified) payload.ifModifiedSince = cached.lastModified;

        const res = await fetch("/api/fetch-image-base64", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.notModified && cached) {
            cached.timestamp = Date.now();
            touchLRU(urlKey, cached);
            src = `data:${cached.mimeType || 'image/jpeg'};base64,${cached.base64}`;
          } else if (data.base64) {
            const mimeType = data.mimeType || 'image/jpeg';
            const freshData: CachedImageData = {
              base64: data.base64,
              mimeType,
              timestamp: Date.now(),
              etag: data.etag,
              lastModified: data.lastModified
            };
            touchLRU(urlKey, freshData);
            src = `data:${mimeType};base64,${data.base64}`;
          }
        } else if (cached) {
          // If conditional revalidation fails with server error, fall back to existing cached version
          touchLRU(urlKey, cached);
          src = `data:${cached.mimeType || 'image/jpeg'};base64,${cached.base64}`;
        }
      } catch (e) {
        console.warn("[Normalize] Failed to fetch image via proxy, trying direct load:", e);
        if (cached) {
          touchLRU(urlKey, cached);
          src = `data:${cached.mimeType || 'image/jpeg'};base64,${cached.base64}`;
        }
      }
    }
  }
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      
      // Short-circuit: If it's already a base64 string and within max dimension
      if (width <= maxDim && height <= maxDim && src.startsWith("data:image/")) {
        return resolve(src);
      }

      // Calculate optimized dimensions
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return resolve(src); // Fallback
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to load image for normalization"));
    img.src = src;
  });
}

// ===============================
// FILE → BASE64 CONVERTER
// ===============================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

export type VisionResultPayload = {
  pose: PoseResult | null;
  mask: MaskResult | null;
  depth: DepthResult | null;
  detection: DetectionResult | null;
  fallback: boolean;
};

// ===============================
// 6. SAFE VISION RUNNER (ANTI CRASH)
// ===============================

export async function runVisionEnginesSafe(payload: {
  base: File | string;
  subject?: File | string;
  outfit?: File | string | null;
}): Promise<VisionResultPayload> {
  const results: VisionResultPayload = {
    pose: null,
    mask: null,
    depth: null,
    detection: null,
    fallback: false,
  };

  try {
    const normalizedBase = await normalizeImageInput(payload.base);

    // 2. HARD LOCK BACKEND
    const backend = await initTFStable();

    // Helper for timeout
    const withTimeout = async <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      let timeoutId: any;
      const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[VISION] Engine timed out after ${ms}ms`);
          resolve(fallback);
        }, ms);
      });
      return Promise.race([
        promise.then((res) => {
          clearTimeout(timeoutId);
          return res;
        }),
        timeoutPromise
      ]);
    };

    if (backend === "none") {
      console.warn("[VISION FALLBACK] TF Backend NOT READY, cloud only.");
      const { depth, detection } = await runUnifiedAnalysis(normalizedBase);
      results.depth = depth;
      results.detection = detection;
      results.fallback = true;
      return results;
    }

    // Parallel execution with error isolation
    // Added hard timeouts to prevent persistent loading spinner if network/webgl hangs
    // Increased to 15s for CPU stability and reduced local resolution
    const localDim = backend === "cpu" ? 512 : 1024;
    const normalizedLocal = await normalizeImageInput(payload.base, localDim);

    const [pose, mask, unified] = await Promise.all([
      withTimeout(runPoseEngine(normalizedLocal).catch(() => null), 15000, null),
      withTimeout(autoMask(normalizedLocal).catch(() => null), 15000, null),
      (async () => {
        // Stagger cloud requests slightly to avoid hitting RPM in burst
        await new Promise(r => setTimeout(r, 1000));
        return runUnifiedAnalysis(normalizedBase).catch(() => ({ detection: null, depth: null }));
      })()
    ]);

    results.pose = pose;
    results.mask = mask;
    results.depth = unified.depth;
    results.detection = unified.detection;
    results.fallback = !pose || !mask || !unified.depth;

  } catch (err) {
    console.warn("[VISION FALLBACK] Critical Error Switching to cloud:", err);
    results.fallback = true;
    
    // Attempt one last cloud detection if normalization succeeded
    try {
      const normalizedBase = await normalizeImageInput(payload.base);
      const { depth, detection } = await runUnifiedAnalysis(normalizedBase);
      results.depth = depth;
      results.detection = detection;
    } catch {}
  }

  return results;
}


