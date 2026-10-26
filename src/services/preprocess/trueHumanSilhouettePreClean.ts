/**
 * PHASE D44 — TRUE HUMAN SILHOUETTE PRE-CLEAN
 * Prepares a cleaned empty scene image to eliminate latent pose inheritance
 * by utilizing BodyPix segmentation masks to clear/inpaint human silhouette regions.
 */

import { autoMask, loadImage } from "../maskService";

export interface HumanPreCleanResult {
  cleanedScene: string;
  detectedHumanRegions: number;
}

export async function buildTrueHumanSilhouettePreClean(
  sceneImage: string,
  actualDetectedRegions: number = 0
): Promise<HumanPreCleanResult> {
  try {
    if (!sceneImage) {
      return { cleanedScene: sceneImage, detectedHumanRegions: actualDetectedRegions };
    }

    // Run autoMask to get person segmentation mask
    const maskResult = await autoMask(sceneImage);
    if (!maskResult || !maskResult.mask) {
      return { cleanedScene: sceneImage, detectedHumanRegions: actualDetectedRegions };
    }

    const img = await loadImage(sceneImage);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { cleanedScene: sceneImage, detectedHumanRegions: actualDetectedRegions };
    }

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imgData.data;
    const maskData = maskResult.mask.data;

    // Calculate average background color (non-masked pixels) for seamless inpainting fill
    let sumR = 0, sumG = 0, sumB = 0, countBg = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (maskData[i + 3] <= 50) {
        sumR += pixels[i];
        sumG += pixels[i + 1];
        sumB += pixels[i + 2];
        countBg++;
      }
    }
    const avgR = countBg > 0 ? Math.round(sumR / countBg) : 240;
    const avgG = countBg > 0 ? Math.round(sumG / countBg) : 240;
    const avgB = countBg > 0 ? Math.round(sumB / countBg) : 240;

    let modifiedCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // If pixel is part of the human silhouette mask (> 50 alpha)
      if (maskData[i + 3] > 50) {
        // Inpaint/replace human silhouette with surrounding background average color
        pixels[i] = avgR;
        pixels[i + 1] = avgG;
        pixels[i + 2] = avgB;
        pixels[i + 3] = 255;
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) {
      ctx.putImageData(imgData, 0, 0);
      const cleanedScene = canvas.toDataURL("image/jpeg", 0.95);
      console.log(`[TrueHumanSilhouettePreClean] Successfully cleared ${modifiedCount} human silhouette pixels using segmentation mask.`);
      return {
        cleanedScene,
        detectedHumanRegions: Math.max(actualDetectedRegions, 1)
      };
    }

    return {
      cleanedScene: sceneImage,
      detectedHumanRegions: actualDetectedRegions
    };
  } catch (err) {
    console.warn("[TrueHumanSilhouettePreClean] Pre-clean error, falling back to original scene:", err);
    return {
      cleanedScene: sceneImage,
      detectedHumanRegions: actualDetectedRegions
    };
  }
}
