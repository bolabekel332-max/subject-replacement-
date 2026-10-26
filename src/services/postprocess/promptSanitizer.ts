/**
 * PHASE D13 — PROMPT SANITIZER
 * STRICT SAFE
 */

export function sanitizePromptStructure(text: string): string {
  return text
    // remove broken symbols
    .replace(/\+\s*\+\*/g, "*")
    .replace(/\*\s*\*/g, "*")

    // remove malformed fragments
    .replace(/\bing seated continuity\b/gi, "scene continuity")

    // normalize recursive SUBJECT wording
    .replace(/full-SUBJECT identity/gi, "full-body identity")
    .replace(/SUBJECT identity identity/gi, "SUBJECT identity")

    // collapse horizontal duplicated spaces only
    .replace(/[^\S\r\n]{2,}/g, " ")

    // normalize line spacing - preserve paragraph gaps
    .replace(/\n{3,}/g, "\n\n")

    // normalize line spacing - preserve paragraph gaps
    .replace(/\n{3,}/g, "\n\n")

    // ensure headings have space after them
    .replace(/^(#+\s+.*)$/gm, "$1\n")

    // ensure subsections have space before them
    .replace(/([^\n])\n*(###+\s+)/g, "$1\n\n$2")

    // ensure list items are on their own lines
    .replace(/([^\n])(\n*\s*([\*\-\+]|(\d+\.))\s+)/g, "$1\n$2")

    // improve readability of special marks
    .replace(/([^\n])\n*(━━━━━━━━━━━━━━━━)/g, "$1\n\n$2")
    .replace(/(━━━━━━━━━━━━━━━━)\n*([^\n])/g, "$1\n\n$2")

    // remove duplicated bullets
    .replace(/(\*\s.*)(\n\1)+/gi, "$1")

    // normalize separators
    .replace(
      /━━━━━━━━━━━━━━━━━━+/g,
      "━━━━━━━━━━━━━━━━"
    )

    // finalize section gaps
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}
