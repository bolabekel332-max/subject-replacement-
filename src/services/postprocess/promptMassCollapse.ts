/**
 * PHASE D49 — PROMPT MASS COLLAPSE (CRITICAL)
 * Final architectural cleanup to prevent instruction dilution and ensure Body Authority Lock dominance.
 */

export function collapsePromptMass(text: string): string {
  return text
    // 1. DELETE LEGACY BLOCKS (D48 Critical Fix)
    .replace(/━━━━━━━━━━━━━━━━ ANATOMY SYNTHESIS PRIORITY ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ HARD SYNTHETIC BODY OVERRIDE ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ HUMAN INSTANCE REPLACEMENT ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ BODY POSITION RESET ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ IDENTITY DOMINANCE ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ SUBJECT COMPOSITION ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ SPATIAL OCCUPANCY RESET ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ OCCUPANCY GHOST SUPPRESSION ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")
    .replace(/━━━━━━━━━━━━━━━━ IDENTITY ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "") // Identity is merged into SUBJECT

    // 2. CONSOLIDATED TERM STRIPPING
    .replace(/\b(occupancy|continuity destruction|biological entity|previous human instance|occupancy ownership|latent seated balance|reconstruction corruption risk|invalid positional continuity|destroyed occupancy data|anatomy synthesis priority|hard synthetic body override)\b/gi, "")

    // 3. NORMALIZE HEADERS
    .replace(/━━━━━━━━━━━━━━━━━━\s*([A-Z_]+)\s*━━━━━━━━━━━━━━━━━━/g, "━━━━━━━━━━━━━━━━ $1 ━━━━━━━━━━━━━━━━")

    // 4. CLEANUP (PATCH V5.1 - Readability Lock)
    // Collapse horizontal spaces only
    .replace(/[^\S\r\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
