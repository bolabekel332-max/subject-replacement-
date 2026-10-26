/**
 * PHASE D14 — STRUCTURE STABILIZER
 * STRICT SAFE
 */

export function stabilizePromptStructure(text: string): string {

  return text

    // remove malformed plus bullets
    .replace(/\+\*/g, "*")

    // remove duplicated bullet markers
    .replace(/\*\s*\*/g, "*")

    // normalize separator duplication
    .replace(
      /(━━━━━━━━━━━━━━━━\s*){2,}/g,
      "━━━━━━━━━━━━━━━━\n"
    )

    // normalize wrapped headings
    .replace(
      /━━━━━━━━━━━━━━━━\s*\*\s*([A-Z0-9\s]+)\s*\*\s*━━━━━━━━━━━━━━━━/g,
      "\n━━━━━━━━━━━━━━━━\n$1\n━━━━━━━━━━━━━━━━"
    )

    // normalize plain headings
    .replace(
      /━━━━━━━━━━━━━━━━\s*([A-Z0-9\s]+)\s*━━━━━━━━━━━━━━━━/g,
      "\n━━━━━━━━━━━━━━━━\n$1\n━━━━━━━━━━━━━━━━"
    )

    // ensure bullets start on new line
    .replace(/\s\*/g, "\n*")

    // fix merged headings
    .replace(
      /([A-Z])\s*\*\s*([A-Z])/g,
      "$1\n\n$2"
    )

    // collapse excessive newlines
    .replace(/\n{3,}/g, "\n\n")

    // trim whitespace
    .trim();
}
