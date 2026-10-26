
/**
 * Robustly extracts the FIRST valid JSON object or array from a text block.
 * Uses a brace-counting approach to find the matching closing delimiter.
 */
export function extractJSON(text: string): string {
  if (!text) return "";
  
  // Find first potential start
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  let start = -1;
  let opener = '';
  let closer = '';
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    opener = '{';
    closer = '}';
  } else if (firstBracket !== -1) {
    start = firstBracket;
    opener = '[';
    closer = ']';
  }
  
  if (start === -1) return text.trim();
  
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    
    if (char === '"') {
      inString = true;
      continue;
    }
    
    if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) {
        // Found the matching terminal!
        return text.substring(start, i + 1).trim();
      }
    }
  }
  
  // Fallback to old behavior if matching fails
  const lastCloser = text.lastIndexOf(closer);
  if (lastCloser > start) {
    return text.substring(start, lastCloser + 1).trim();
  }
  
  return text.trim();
}
