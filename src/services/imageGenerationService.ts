import { safeGenerateContent } from "./geminiService";
import { exportRealEmptyScene } from "./preprocess/realEmptySceneExporter";
import { buildStructuralHumanErasure, base64ToFile } from "./preprocess/structuralHumanEraser";
import { formatChatTriggerForEngine } from "./postprocess/chatTriggerTokens";

// Helper to convert File back to Base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

const SYSTEM_INSTRUCTIONS = `[ROLE]
You are a high-precision Visual Synthesis Engine. Your objective is to synthesize a final image based on technical instructions and provided assets.

[INPUT ASSETS]
- [EMPTY_SCENE_IMAGE]: The reconstructed architectural environment and perspective anchor (No humans).
- [REFERENCE_SUBJECT]: The source for identity and proportions.
- [OUTFIT_ASSET]: The source for clothing material and color.

[MODUS OPERANDI]
1. TECHNICAL ACCURACY: Treat the PROMPT as technical commands.
2. IDENTITY PRESERVATION: Transfer [REFERENCE_SUBJECT] identity accurately.
3. POSE ALIGNMENT: Follow the "STAGE 2" instructions for joint angles.
4. GROUNDING: Ensure the subject is physically anchored to the [EMPTY_SCENE_IMAGE] with natural shadows.
5. NEGATIVE COMPLIANCE: Adhere strictly to [NEGATIVE_CONSTRAINTS].

[SYSTEM LOCK]
Prioritize technical accuracy and realistic integration. DO NOT under any circumstances generate any visual watermarks, logos, or signatures.`;

export interface ImageReconstructionResult {
  success: boolean;
  base64?: string;
  error?: string;
  details?: any;
}

interface ImagePayload {
  data: string;
  label: string;
}

/**
 * Reconstructs an image using multiple source assets.
 */
export const reconstructImageWithAssets = async (
  prompt: string,
  baseImage: string,
  targetSubject: string,
  outfitReference?: string | null,
  negativePrompt?: string,
  aspectRatio: string = "1:1",
  chatTrigger?: string
): Promise<ImageReconstructionResult> => {
  if (!prompt || !baseImage || !targetSubject) {
    return { success: false, error: "Prompt, Base Image, and Target Subject are required" };
  }

  try {
    console.log(`[ImageService] Pipelining multi-asset request to Gemini with AspectRatio: ${aspectRatio}...`);

    // --- PHASE X1: REAL EMPTY SCENE EXPORT (CRITICAL SAFE) ---
    console.log("[ImageService] Executing Real Empty Scene Export Stage 1A...");
    let purgedBaseImage = "";
    try {
      const baseFile = base64ToFile(baseImage, "main_scene.jpg");
      const emptySceneFile = await buildStructuralHumanErasure(baseFile);
      purgedBaseImage = await fileToBase64(emptySceneFile);
    } catch (e) {
      console.warn("[ImageService] Structural human erasure error, using legacy exporter fallback:", e);
      purgedBaseImage = await exportRealEmptyScene(baseImage);
    }

    const parts: any[] = [];

    // Helper to clean base64
    const cleanB64 = (b64: string) => b64.includes('base64,') ? b64.split('base64,')[1] : b64;

    // 1. EMPTY_SCENE_IMAGE (Exporter Output)
    parts.push({ text: "[EMPTY_SCENE_IMAGE]" });
    parts.push({
      inlineData: {
        data: cleanB64(purgedBaseImage),
        mimeType: "image/jpeg"
      }
    });

    // 2. REFERENCE_SUBJECT
    parts.push({ text: "[REFERENCE_SUBJECT]" });
    parts.push({
      inlineData: {
        data: cleanB64(targetSubject),
        mimeType: "image/jpeg"
      }
    });

    // 3. OUTFIT_ASSET (Optional)
    if (outfitReference) {
      parts.push({ text: "[OUTFIT_ASSET]" });
      parts.push({
        inlineData: {
          data: cleanB64(outfitReference),
          mimeType: "image/jpeg"
        }
      });
    }

    // 4. THE PROMPT (Technical instructions + Chat Trigger)
    let finalPrompt = `PROMPT:\n${prompt}`;
    
    if (chatTrigger && chatTrigger.trim()) {
      const formattedTrigger = formatChatTriggerForEngine(chatTrigger, 'nano');
      if (formattedTrigger) {
        finalPrompt += `\n\n[SUBJECT_DIRECTIVE]\nSubject attributes directive: ${formattedTrigger}.`;
      }
    }

    if (negativePrompt) {
      finalPrompt += `\n\n[NEGATIVE_CONSTRAINTS]\nAvoid: ${negativePrompt}`;
    }

    parts.push({
      text: finalPrompt
    });

    const response = await safeGenerateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: parts,
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        imageConfig: {
          aspectRatio: aspectRatio,
          addWatermark: false
        } as any
      }
    });

    console.log("[ImageService] Gemini Full Response:", JSON.stringify(response, null, 2));

    if (!response.candidates?.[0]) {
      return { 
        success: false, 
        error: "Empty response from model (No candidates)",
        details: response.promptFeedback 
      };
    }

    const candidate = response.candidates[0];

    if (candidate.finishReason === "SAFETY") {
      return { 
        success: false, 
        error: "Generation blocked by safety filters",
        details: candidate.safetyRatings 
      };
    }

    if (!candidate.content?.parts) {
      return { 
        success: false, 
        error: "Empty response from model (No parts)",
        details: candidate
      };
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return {
          success: true,
          base64: `data:image/png;base64,${part.inlineData.data}`
        };
      }
    }

    return { success: false, error: "No image data found in response" };
  } catch (err: any) {
    console.error("[ImageService] Pipeline failure:", err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "An unexpected error occurred during image reconstruction" 
    };
  }
};
