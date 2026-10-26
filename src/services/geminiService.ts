
import { GenerateContentResponse } from "@google/genai";

const MAX_RETRIES = 1;
const INITIAL_BACKOFF_MS = 2000;

export class QueueCancelledError extends Error {
  constructor() {
    super("Pemesanan antrean dibatalkan oleh pengguna");
    this.name = "QueueCancelledError";
  }
}

export interface WaiterOptions {
  onQueueWait?: (elapsedSec: number, cancelWait: () => void) => void;
  onWaitEnd?: () => void;
}

interface RequestQueueItem {
  resolve: () => void;
  reject: (err: Error) => void;
  timerId?: any;
}

// ========================================
// CONCURRENCY & RATE LIMIT MANAGER (V3 STABLE)
// ========================================
// Free Tier for Gemini is strict on RPM/TPM.
// We serialize requests and add spacing to avoid hitting limits.
// ========================================

let activeRequests = 0;
const MAX_CONCURRENT = 1; 
const requestQueue: RequestQueueItem[] = [];

// Global penalty for recent quota hits
let globalSpacingPenaltyMs = 0; 
const BASE_SPACING_MS = 1000;

async function acquireSlot(options?: WaiterOptions): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    if (options?.onWaitEnd) options.onWaitEnd();
    return;
  }

  return new Promise<void>((resolve, reject) => {
    let elapsedSec = 0;
    let timerId: any = null;

    const cancelWait = () => {
      if (timerId) clearInterval(timerId);
      const index = requestQueue.findIndex(item => item.resolve === queueResolve);
      if (index !== -1) {
        requestQueue.splice(index, 1);
      }
      reject(new QueueCancelledError());
    };

    const queueResolve = () => {
      if (timerId) clearInterval(timerId);
      if (options?.onWaitEnd) options.onWaitEnd();
      resolve();
    };

    const queueItem: RequestQueueItem = {
      resolve: queueResolve,
      reject
    };

    requestQueue.push(queueItem);

    if (options?.onQueueWait) {
      options.onQueueWait(0, cancelWait);
      timerId = setInterval(() => {
        elapsedSec++;
        if (options?.onQueueWait) {
          options.onQueueWait(elapsedSec, cancelWait);
        }
      }, 1000);
      queueItem.timerId = timerId;
    }
  });
}

function releaseSlot() {
  activeRequests--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) {
      activeRequests++;
      // Calculate delay with potential penalty
      const delay = Math.max(BASE_SPACING_MS, globalSpacingPenaltyMs);
      setTimeout(() => {
        next.resolve();
      }, delay);
      
      // Slowly decay penalty over time
      if (globalSpacingPenaltyMs > 0) {
        globalSpacingPenaltyMs = Math.max(0, globalSpacingPenaltyMs - 500);
      }
    }
  }
}

/**
 * Enhanced Gemini Wrapper with serialization, transient retry (1x), and exponential backoff.
 */
export async function safeGenerateContent(params: any, options?: WaiterOptions): Promise<GenerateContentResponse> {
  await acquireSlot(options);
  
  try {
    let attempt = 0;
    
    while (attempt < MAX_RETRIES) {
      try {
        console.log(`[GeminiService] Calling proxy for generation...`);
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params }),
          signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Proxy error: ${response.status}`);
        }

        const data = await response.json();
        return data as GenerateContentResponse;
      } catch (error: any) {
        const errorMessage = error?.message?.toLowerCase() || "";
        const isQuotaError = 
          errorMessage.includes("resource_exhausted") || 
          errorMessage.includes("429") || 
          errorMessage.includes("quota");

        // If the quota limit is 0 (e.g. Free Tier on image generation models), retries will never succeed.
        // Throw immediately to display the real API error to the user without false wait delays.
        if (errorMessage.includes("limit: 0") || errorMessage.includes("limit: 0.0")) {
          throw error;
        }

        const isTransientError =
          errorMessage.includes("500") ||
          errorMessage.includes("internal") ||
          errorMessage.includes("rpc failed") ||
          errorMessage.includes("xhr error") ||
          errorMessage.includes("network error");

        if (isQuotaError || isTransientError) {
          attempt++;
          
          if (isQuotaError) {
            globalSpacingPenaltyMs = Math.min(10000, globalSpacingPenaltyMs + 2000);
          }

          console.error(`[GeminiService] Failure after ${MAX_RETRIES} attempts.`, error);
          throw error;
        }
        
        throw error;
      }
    }
    
    throw new Error("Maximum retries exceeded");
  } finally {
    releaseSlot();
  }
}

