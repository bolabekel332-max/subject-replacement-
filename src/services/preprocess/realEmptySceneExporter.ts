import { safeGenerateContent } from "../geminiService";

const sceneCache = new Map<string, string>();

/**
 * PHASE X1 — STAGE 1A: REAL EMPTY SCENE EXPORT
 * Physically generates a real empty environment image by removing human presence.
 */
export async function exportRealEmptyScene(mainSceneB64: string): Promise<string> {
  // Simple cache check to avoid redundant generation
  if (sceneCache.has(mainSceneB64)) {
    console.log("[Exporter] Using cached EMPTY SCENE image.");
    return sceneCache.get(mainSceneB64)!;
  }

  console.log("[Exporter] Generating REAL EMPTY SCENE image...");

  const cleanB64 = (b64: string) => b64.includes('base64,') ? b64.split('base64,')[1] : b64;

  const parts = [
    { text: "[MAIN_SCENE]" },
    {
      inlineData: {
        data: cleanB64(mainSceneB64),
        mimeType: "image/jpeg"
      }
    },
    {
      text: `TASK: Generate a REAL empty environment image based on [MAIN_SCENE].

REMOVE:
- All humans and body silhouettes
- All seated or standing occupancy patterns
- Chair pressure and upholstery deformation
- Limb topology and human shadows
- Accessories, watches, and handheld objects

PRESERVE:
- Core environment architecture and furniture layout
- Lighting source, direction, and intensity
- Atmospheric depth, black levels, and sensor noise
- Exact camera angle and lens characteristics

OUTPUT:
A high-fidelity photographic reconstruction of the environment as if no one was present.`
    }
  ];

  try {
    const response = await safeGenerateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: parts,
      },
      config: {
        systemInstruction: "You are an specialized Architectural Inpainting Engine. Your mission is to reconstruct empty environments from occupied scenes with zero human latency.",
        imageConfig: {
          aspectRatio: "original"
        }
      }
    });

    if (!response.candidates?.[0]?.content?.parts) {
      throw new Error("Empty response from exporter model.");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const result = `data:image/png;base64,${part.inlineData.data}`;
        sceneCache.set(mainSceneB64, result);
        return result;
      }
    }

    throw new Error("No image data found in export response.");
  } catch (err: any) {
    console.error("[Exporter] Failed to export real empty scene:", err);
    // Fallback to original scene if export fails (safeguard)
    return mainSceneB64;
  }
}
