/**
 * PHASE S1 — STAGE ISOLATION FIREWALL V1 (CRITICAL SAFE)
 * Prevents Stage 2 from inheriting latent human scaffold data from the original scene.
 */

export function enforceStageIsolation(prompt: string): string {
  if (!prompt) return "";

  let modified = prompt;

  // 1. Semantic Isolation Mapping
  // Replace references to the original scene with the reconstructed empty frame
  const sourcePatterns = [
    /MAIN_SCENE/g,
    /ORIGINAL_SCENE/g,
    /SOURCE_SCENE/g,
    /RECONSTRUCTED_EMPTY_SCENE/g
  ];

  sourcePatterns.forEach(pattern => {
    modified = modified.replace(pattern, "EMPTY_SCENE_FRAME");
  });

  // 2. Inject Semantic Firewall & Generation Authority
  const isolationBlock = [
    "",
    "### STAGE ISOLATION FIREWALLV1",
    "* STAGE 2 has no access to original human occupancy data.",
    "* All human anatomy generation must originate from SUBJECT reference only.",
    "",
    "### FORBIDDEN FOR STAGE 2:",
    "* original human geometry",
    "* seated scaffold memory",
    "* occupancy rhythm",
    "* limb spacing inheritance",
    "* chair pressure inheritance",
    ""
  ].join("\n");

  // Injection strategy: Append to the Stage 2/Environment section if possible, 
  // or simply ensure it's prioritized in the prompt.
  // We'll look for the start of the Environment or Subject Generation section.
  
  if (modified.includes("ENVIRONMENT:")) {
    modified = modified.replace("ENVIRONMENT:", `ENVIRONMENT:\n${isolationBlock}`);
  } else if (modified.includes("## 2. SUBJECT GENERATION")) {
    modified = modified.replace("## 2. SUBJECT GENERATION", `## 2. SUBJECT GENERATION\n${isolationBlock}`);
  } else {
    modified = `${isolationBlock}\n${modified}`;
  }

  return modified;
}
