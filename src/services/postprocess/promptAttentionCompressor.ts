/**
 * PHASE D48 — PROMPT ATTENTION COMPRESSOR
 * Structural reduction and semantic optimization to prevent model attention fragmentation.
 */

export function compressPromptAttention(prompt: string): string {
  let result = prompt;

  // Ensure headers are clean and uniform.
  result = result.replace(/━━━━━━━━━━━━━━━━━━\s*([A-Z_]+)\s*━━━━━━━━━━━━━━━━━━/g, "━━━━━━━━━━━━━━━━ $1 ━━━━━━━━━━━━━━━━");

  // Normalize spaces and line breaks
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}

