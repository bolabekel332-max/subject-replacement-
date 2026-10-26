/**
 * PHASE S2 — STAGE 2 ENVIRONMENT LOCK V1 (CRITICAL SAFE)
 * Prevents Stage 2 from using latent occupancy geometry from the reconstructed scene.
 */

export function injectStage2EnvironmentLock(prompt: string): string {
  if (!prompt) return "";

  const lockBlock = [
    "",
    "### STAGE 2 ENVIRONMENT LOCK",
    "* Environment reference is limited to:",
    "  - lighting",
    "  - camera perspective",
    "  - atmospheric depth",
    "  - environmental texture",
    "  - lens behavior",
    "",
    "* Environment reference must NOT provide:",
    "  - human spacing",
    "  - seated geometry",
    "  - limb rhythm",
    "  - occupancy balance",
    "  - body alignment",
    "  - silhouette flow",
    "  - pressure distribution",
    "",
    "* Subject spatial structure must originate exclusively from SUBJECT reference.",
    "* Seating interaction must be recalculated solely from generated anatomy.",
    "* Environmental furniture must adapt to generated body geometry.",
    "* Human occupancy data from reconstructed scene is invalid for anatomy generation.",
    ""
  ].join("\n");

  let modified = prompt;

  // Injection strategy: Targeting Stage 2 Environment block
  if (modified.includes("ENVIRONMENT:")) {
    modified = modified.replace("ENVIRONMENT:", `ENVIRONMENT:\n${lockBlock}`);
  } else {
    // Fallback if structure differs
    modified = `${lockBlock}\n${modified}`;
  }

  return modified;
}
