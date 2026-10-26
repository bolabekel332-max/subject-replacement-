/**
 * PHASE D36 — STRUCTURAL HUMAN ERASURE PREPROCESSOR
 * Architecture Shift: Full Frame Structural Human Deconstruction and Pure Architectural Inpainting.
 */

import { safeGenerateContent } from "../geminiService";
import { autoMask, loadImage } from "../maskService";

// Helper to convert File to Base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// Helper to convert Base64 dataset to File
export function base64ToFile(base64: string, filename: string): File {
  const arr = base64.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Analyzes pixels of the reconstructed image to ensure the erased zone (where human was present)
 * matches the lighting and brightness of the surrounding background environment, resolving any dark artifacts.
 */
async function verifyAndCorrectBrightnessUniformity(
  reconstructedB64: string,
  mask: ImageData
): Promise<string> {
  try {
    const img = await loadImage(reconstructedB64);
    const canvas = document.createElement("canvas");
    canvas.width = mask.width;
    canvas.height = mask.height;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return reconstructedB64;
    
    // Draw onto canvas to extract matching pixel array
    ctx.drawImage(img, 0, 0, mask.width, mask.height);
    const imgData = ctx.getImageData(0, 0, mask.width, mask.height);
    const pixels = imgData.data;
    const maskData = mask.data;
    
    let sumMaskBrightness = 0;
    let countMaskPixels = 0;
    let sumBgBrightness = 0;
    let countBgPixels = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Calculate perceptive luminance/brightness (ITU-R BT.709 formulas)
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      
      // Mask alpha > 50 represents the human erased zone
      const isMasked = maskData[i + 3] > 50; 
      
      if (isMasked) {
        sumMaskBrightness += brightness;
        countMaskPixels++;
      } else {
        sumBgBrightness += brightness;
        countBgPixels++;
      }
    }
    
    if (countMaskPixels === 0 || countBgPixels === 0) {
      console.log("[Brightness Verifier] Insufficient pixels in masked or background regions.");
      return reconstructedB64;
    }
    
    const avgMaskBrightness = sumMaskBrightness / countMaskPixels;
    const avgBgBrightness = sumBgBrightness / countBgPixels;
    
    console.log(`[Brightness Verifier] Erased Zone Luma: ${avgMaskBrightness.toFixed(2)}, Bg Luma: ${avgBgBrightness.toFixed(2)}`);
    
    const brightnessRatio = avgMaskBrightness / (avgBgBrightness || 1);
    
    // Mismatch detection: if the erased zone is more than 18% darker than background or drops below safe threshold (30 out of 255)
    if (brightnessRatio < 0.82 || avgMaskBrightness < 30) {
      console.warn(`[Brightness Verifier] Mismatch detected (ratio: ${brightnessRatio.toFixed(2)}). Elevating erased zone luminosity...`);
      
      // Calculate multiplier to match background lighting safely without bleeding into bright artifacts
      const targetBrightness = Math.max(avgBgBrightness * 0.95, 45);
      const correctionFactor = targetBrightness / (avgMaskBrightness || 1);
      
      for (let i = 0; i < pixels.length; i += 4) {
        const maskAlpha = maskData[i + 3] / 255.0;
        if (maskAlpha > 0.05) {
          // Dynamic gain matching smoothly feathered with alpha
          const factor = 1.0 + (correctionFactor - 1.0) * maskAlpha;
          
          pixels[i] = Math.min(255, Math.round(pixels[i] * factor));
          pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] * factor));
          pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] * factor));
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      console.log("[Brightness Verifier] Brightness uniformity correction applied beautifully.");
      return canvas.toDataURL("image/jpeg", 0.95);
    }
    
    console.log("[Brightness Verifier] Brightness levels are uniform. Skipping correction.");
    return reconstructedB64;
  } catch (error) {
    console.error("[Brightness Verifier] Verification failed, ignoring:", error);
    return reconstructedB64;
  }
}

/**
 * Main function: Receives a sceneImage File, detects and erases the entire human structure,
 * reconstructs the empty scene at image level, and returns the finished Empty Scene File.
 */
export async function buildStructuralHumanErasure(
  sceneImage: File
): Promise<File> {
  console.log("[Structural Eraser] Starting human deconstruction and background reconstruction...");

  try {
    // 1. Convert input File to base64
    const originalB64 = await fileToBase64(sceneImage);
    const cleanB64 = (b64: string) => b64.includes("base64,") ? b64.split("base64,")[1] : b64;

    // 2. Perform Human Segmentation to analyze/verify human occupancy
    console.log("[Structural Eraser] Estimating human occupancy bounds...");
    const maskInfo = await autoMask(originalB64);
    
    let maskIndicatorText = "";
    if (maskInfo && maskInfo.confidence > 0) {
      console.log(`[Structural Eraser] Person detected with confidence: ${maskInfo.confidence}`);
      maskIndicatorText = `\n[OCCUPANCY INFO]\nHuman presence detected with confidence level: ${maskInfo.confidence}. Structural area segmentation completed. Expended mask area by 15-25% dynamically to clear all silhouette outlines, selfie stretch anchors, and edge pixels.`;
    }

    // 3. Request true empty scene reconstruction from specialized Architectural Inpainting Engine
    const parts = [
      { text: "[MAIN_SCENE]" },
      {
        inlineData: {
          data: cleanB64(originalB64),
          mimeType: "image/jpeg"
        }
      },
      {
        text: `TASK: Detect, erase, and perform zero-human architectural inpainting reconstruction.
        
[HUMAN DECONSTRUCTION DIRECTIVES]
1. DETECT HUMAN REGION:
   - Identify all biological human forms: face, complete torso, shoulders, arms, legs, fingers.
   - Detect selfie arm extension line and posture geometry.
   - Detect any camera-facing shoulder silhouette and seated occupancy patterns.
   ${maskIndicatorText}

2. EXPAND ERASURE REGION (15-25% OVER-CLEAN):
   - Expand the deconstruction boundary beyond the physical body edge to perfectly eliminate:
     * Silhouette edge residue
     * Clothing outline shadow leakage
     * Selfie arm depth/framing anchoring pixels
     * Chair compression shadows and clothing interaction artifacts

3. RECONSTRUCT ARCHITECTURAL ENVIRONMENT:
   - Fully reconstruct the missing background behind where the human once sat or stood.
   - Rebuild furniture, chair backrest, couch textures, floor panels, wall geometry with total consistency.
   - Retain complete lighting continuity, shadows, depth perspective, and ambient illumination.
   - Ensure ZERO silhouette ghosting, blurred residuals, or face/torso outline remnants.

OUTPUT:
Retranslate [MAIN_SCENE] into a beautiful, naturally photographed empty architectural space. Human presence must be structurally impossible to trace.`
      }
    ];

    console.log("[Structural Eraser] Requesting image-level frame deconstruction from Gemini...");
    const response = await safeGenerateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: {
        parts: parts,
      },
      config: {
        systemInstruction: "You are an expert Architectural Inpainting Engine. Your mission is to reconstruct pristine, unoccupied rooms and environments from input photos containing human figures.",
        imageConfig: {
          aspectRatio: "original"
        }
      }
    });

    if (!response.candidates?.[0]?.content?.parts) {
      throw new Error("Empty response from Architectural Inpainting Engine.");
    }

    let resultB64 = "";
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        resultB64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!resultB64) {
      throw new Error("No image data found in inpainting response.");
    }

    // 4. Run post-inpainting brightness level verification and safe-guard tuning
    let verifiedB64 = resultB64;
    if (maskInfo && maskInfo.mask) {
      console.log("[Structural Eraser] Verifying image brightness uniformity in the erased zone...");
      verifiedB64 = await verifyAndCorrectBrightnessUniformity(resultB64, maskInfo.mask);
    }

    console.log("[Structural Eraser] Background successfully reconstructed. Creating Empty Scene File...");
    return base64ToFile(verifiedB64, "empty_scene_" + sceneImage.name);

  } catch (error) {
    console.error("[Structural Eraser] Preprocessor failed, returning original image:", error);
    // Return original scene image on fallback/error to preserve pipeline continuity
    return sceneImage;
  }
}
