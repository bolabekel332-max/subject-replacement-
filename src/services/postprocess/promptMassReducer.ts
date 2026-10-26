/**
 * PHASE D41 — PROMPT MASS REDUCTION
 * Reduces semantic overload and instruction collision on Nano Banana.
 */

export function promptMassReducer(text: string): string {
  return text
    // collapse repeated EMPTY_SCENE blocks
    .replace(/━━━━━━━━━━━━━━━━ EMPTY_SCENE ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")

    // collapse repeated IDENTITY blocks
    .replace(/━━━━━━━━━━━━━━━━ IDENTITY ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")

    // collapse repeated HUMAN INSTANCE REPLACEMENT blocks
    .replace(/━━━━━━━━━━━━━━━━ HUMAN INSTANCE REPLACEMENT ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")

    // collapse repeated SPATIAL OCCUPANCY RESET blocks
    .replace(/━━━━━━━━━━━━━━━━ SPATIAL OCCUPANCY RESET ━━━━━━━━━━━━━━━━[\s\S]*?(?=━━━━━━━━━━━━━━━━|$)/g, "")

    // normalize duplicated phrases
    .replace(/newly photographed/gi, "photographed")
    .replace(/biologically consistent/gi, "consistent")
    .replace(/physically believable/gi, "realistic")

    // remove duplicated bullets
    .replace(/(\* .+)(\n\1)+/g, "$1")

    // collapse horizontal duplicated spaces only (PATCED V5.1 PROTECTED ZONE)
    .replace(/[^\S\r\n]{2,}/g, " ")

    // remove excessive line breaks (preserve paragraph gaps)
    .replace(/\n{3,}/g, "\n\n");
}
