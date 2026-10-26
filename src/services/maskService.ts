
import * as tf from '@tensorflow/tfjs-core';
import * as bodyPix from '@tensorflow-models/body-pix';
import { initTF } from './tfService';

export type MaskResult = {
  mask: ImageData;
  cutout: string; // base64 PNG
  confidence: number;
};

let net: bodyPix.BodyPix | null = null;
let modelLoadPromise: Promise<bodyPix.BodyPix> | null = null;

/**
 * 5. MASK ENGINE GUARD
 */
async function safeLoadSegmentationModel(retries = 3, delay = 2000) {
  const backend = tf.getBackend();

  if (!backend) {
    throw new Error("[VISION] TF Backend NOT READY");
  }

  if (net) return net;
  if (modelLoadPromise) return modelLoadPromise;

  const attemptLoad = async (remaining: number): Promise<bodyPix.BodyPix> => {
    try {
      const model = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
      });
      net = model;
      modelLoadPromise = null;
      return model;
    } catch (err) {
      if (remaining > 0) {
        console.warn(`[Mask Engine] Load failed, retrying in ${delay}ms... (${remaining} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptLoad(remaining - 1);
      }
      modelLoadPromise = null;
      throw err;
    }
  };

  modelLoadPromise = attemptLoad(retries);
  return modelLoadPromise;
}

// Aliasing existing loadModel to use the safer pattern
const loadModel = safeLoadSegmentationModel;

export function validateImage(input: any) {
  if (!input) throw new Error("Image missing");
  if (typeof input !== 'string') throw new Error("Invalid format");
  if (!input.startsWith('http') && !input.startsWith('data:')) {
    throw new Error("Unsupported image source (must be URL or Base64)");
  }
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  validateImage(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Failed to load image element"));
  });
}

/**
 * Fallback: Generate a rough bounding box mask if segmentation fails
 */
function generateRoughBoundingBoxMask(width: number, height: number): ImageData {
  const mask = new ImageData(width, height);
  // Simple center focus mask (70% width/height)
  const marginW = Math.floor(width * 0.15);
  const marginH = Math.floor(height * 0.1);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isInside = x > marginW && x < (width - marginW) && y > marginH && y < (height - marginH);
      
      mask.data[idx] = 255;
      mask.data[idx+1] = 255;
      mask.data[idx+2] = 255;
      mask.data[idx+3] = isInside ? 255 : 0;
    }
  }
  return mask;
}

/**
 * Perform person segmentation using BodyPix
 */
export async function segmentPerson(img: HTMLImageElement) {
  try {
    const model = await loadModel();
    const segmentation = await model.segmentPerson(img, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7
    });
    return segmentation;
  } catch (error) {
    console.error("Segmentation Error:", error);
    return null;
  }
}

/**
 * Convert probability map to ImageData mask
 */
export function buildMask(segmentation: any, width: number, height: number): ImageData {
  const mask = new ImageData(width, height);
  const data = segmentation.data;

  for (let i = 0; i < data.length; i++) {
    const value = data[i]; // 0 or 1 in BodyPix basic segmentation
    const alpha = value === 1 ? 255 : 0;

    mask.data[i * 4 + 0] = 255; // White mask
    mask.data[i * 4 + 1] = 255;
    mask.data[i * 4 + 2] = 255;
    mask.data[i * 4 + 3] = alpha;
  }

  return mask;
}

/**
 * Apply alpha mask to image to create cutout
 */
export function applyMask(img: HTMLImageElement, mask: ImageData): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  for (let i = 0; i < imageData.data.length; i += 4) {
    // Only use the alpha from our mask
    imageData.data[i + 3] = mask.data[i + 3];
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}

/**
 * Simple box blur for mask feathering
 */
export function featherMask(mask: ImageData, radius = 2): ImageData {
  const { width, height, data } = mask;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  
  if (radius <= 0) return out;

  // Simple horizontal and vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width) {
          sum += data[(y * width + nx) * 4 + 3];
          count++;
        }
      }
      out.data[(y * width + x) * 4 + 3] = sum / count;
    }
  }
  
  const vertical = new Uint8ClampedArray(out.data);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) {
          sum += vertical[(ny * width + x) * 4 + 3];
          count++;
        }
      }
      out.data[(y * width + x) * 4 + 3] = sum / count;
    }
  }

  return out;
}

function estimateConfidence(segmentation: any): number {
  if (!segmentation || !segmentation.data) return 0;
  const count = segmentation.data.filter((v: number) => v === 1).length;
  const total = segmentation.data.length;
  
  // Heuristic: if it detected at least some person and not the whole image
  const ratio = count / total;
  if (ratio > 0.01 && ratio < 0.9) return 0.85;
  if (ratio > 0) return 0.5;
  return 0;
}

/**
 * Main Entry Point for Auto Masking
 */
export async function autoMask(src: string): Promise<MaskResult | null> {
  try {
    const img = await loadImage(src);
    const segmentation = await segmentPerson(img);

    let mask: ImageData;
    let confidence: number;

    if (!segmentation) {
      console.warn("Segmentation failed, using rough bounding box fallback");
      mask = generateRoughBoundingBoxMask(img.width, img.height);
      confidence = 0.3; // Low confidence for fallback
    } else {
      mask = buildMask(segmentation, img.width, img.height);
      mask = featherMask(mask, 2);
      confidence = estimateConfidence(segmentation);
    }

    const cutout = applyMask(img, mask);

    return {
      mask,
      cutout,
      confidence
    };
  } catch (error) {
    console.error("Auto Mask Error:", error);
    return null;
  }
}
