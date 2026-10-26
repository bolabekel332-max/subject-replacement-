/**
 * Deterministically constructs a visual description of the scene.
 */
export function generateDeterministicSimulation(analysis: any, subjectTraits: any, extraFields: { pose?: string, outfit?: string, framing?: string } = {}): string {
  const parts = [];
  
  if (subjectTraits && (subjectTraits.faceShape || subjectTraits.hair || subjectTraits.expression)) {
    const traits = [subjectTraits.faceShape, subjectTraits.hair, subjectTraits.expression].filter(Boolean).join(", ");
    parts.push(`Subject: ${traits}`);
  }

  if (extraFields.pose) parts.push(`Pose: ${extraFields.pose}`);
  if (extraFields.outfit) parts.push(`Outfit: ${extraFields.outfit}`);
  
  let framingText = "";
  if (extraFields.framing === 'FULL_BODY') framingText = "full body";
  else if (extraFields.framing === 'HALF_BODY') framingText = "half body";
  else framingText = extraFields.framing || "";
  if (framingText) parts.push(`Framing: ${framingText}`);

  if (analysis.environment) {
    parts.push(`Environment: ${analysis.environment}`);
  }

  if (analysis.lighting) {
    parts.push(`Lighting: ${analysis.lighting}`);
  }

  if (analysis.angle) {
    parts.push(`Angle: ${analysis.angle}`);
  }

  return parts.length > 0 ? parts.join(". ") : "Visual description of the composite scene.";
}

/**
 * Checks if the simulation text contains meta/execution instructions.
 * 
 * Tradeoff: Bare single-word tokens like 'engine' or 'authority' (e.g. 'engine room')
 * are intentionally excluded to prevent false positives on valid visual descriptions;
 * meta instructions must contain one of the compound forbidden meta tokens 
 * (EXECUTION STRATEGY, POSE CONTROL ENGINE, ANATOMY AUTHORITY, PARAMETER LOCK, SUBJECT INTEGRITY).
 */
export function isMetaInstruction(text: string): boolean {
  const metaKeywords = [
    "execution strategy",
    "pose control engine",
    "anatomy authority",
    "parameter lock",
    "subject integrity"
  ];
  const lower = text.toLowerCase();
  return metaKeywords.some(keyword => lower.includes(keyword));
}
