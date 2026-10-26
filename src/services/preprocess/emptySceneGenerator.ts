/**
 * PHASE A — EMPTY SCENE PREPROCESS PIPELINE (CRITICAL)
 * Preprocessing stage that removes human humanpresence context from the scene to construct an empty environment.
 */

export function generateEmptyScene(mainScene: string): string {
  // CONCEPTUAL PREPROCESSOR:
  // Redefines the scene as a naturally reconstructed empty environment.
  // This ensures the generation engine treats the background as a blank photographed canvas.

  const emptySceneHeader = `EMPTY_SCENE_RECONSTRUCTION(${mainScene})`;
  
  const preprocessMetadata = [
    `━━━━━━━━━━━━━━━━━━`,
    `EMPTY SCENE GENERATION`,
    `━━━━━━━━━━━━━━━━━━`,
    `Function:`,
    `- remove all humans`,
    `- reconstruct furniture`,
    `- reconstruct chair surface`,
    `- reconstruct background continuity`,
    `- preserve lighting`,
    `- preserve camera angle`,
    `- preserve environmental depth`,
    `OUTPUT: EMPTY_SCENE`
  ].join("\n");

  // We return a composite string that Nano Banana core understands
  // as the base scene without latent human memory.
  return `${emptySceneHeader}\n${preprocessMetadata}`;
}

