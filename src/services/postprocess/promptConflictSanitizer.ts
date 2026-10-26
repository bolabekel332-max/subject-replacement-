/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SanitizerContext {
  structuredAngle?: string;           // e.g. "eye level", "low angle", "high angle"
  structuredFraming?: string;         // e.g. "FULL_BODY", "HALF_BODY", "CLOSE_UP", "full body", "medium shot"
  structuredLightingQuality?: string; // e.g. "directional flash", "hard lighting", "soft lighting"
  structuredColorTone?: string;       // e.g. "warm tones", "cool tones", "mixed lighting"
  isMixedLighting?: boolean;         // Explicit flag for mixed lighting exception
}

export interface SanitizerResult {
  sanitizedPrompt: string;
  logs: string[];
}

interface PatternDef {
  key: string;
  canonical: string;
  patterns: string[];
}

// Group definitions for conflict detection
const ANGLE_PATTERNS: PatternDef[] = [
  {
    key: "eye_level",
    canonical: "eye level",
    patterns: ["eye-level angle", "eye level angle", "eye-level perspective", "eye level perspective", "eye-level shot", "eye level shot", "eye-level", "eye level"]
  },
  {
    key: "low_angle",
    canonical: "low angle",
    patterns: ["worm's-eye view", "worm's eye view", "extreme low angle", "low-angle shot", "low angle shot", "low-angle", "low angle"]
  },
  {
    key: "high_angle",
    canonical: "high angle",
    patterns: ["bird's-eye view", "bird's eye view", "top-down view", "top down view", "high-angle shot", "high angle shot", "overhead shot", "overhead", "top-down", "top down", "high-angle", "high angle"]
  }
];

const FRAMING_PATTERNS: PatternDef[] = [
  {
    key: "extreme_close_up",
    canonical: "extreme close-up",
    patterns: ["extreme close-up", "extreme close up", "macro shot"]
  },
  {
    key: "close_up",
    canonical: "close-up",
    patterns: ["close-up shot", "close up shot", "close-up", "close up", "headshot", "portrait shot"]
  },
  {
    key: "medium_shot",
    canonical: "medium shot",
    patterns: ["medium full shot", "medium shot", "waist-up shot", "waist-up", "half body", "half-body"]
  },
  {
    key: "full_body",
    canonical: "full body",
    patterns: ["full-length shot", "full length shot", "full body shot", "full-length", "full body", "full-body", "full shot", "wide shot", "long shot"]
  }
];

const LIGHTING_QUALITY_PATTERNS: PatternDef[] = [
  {
    key: "hard",
    canonical: "hard lighting",
    patterns: ["high contrast lighting", "directional lighting", "directional flash", "camera flash", "direct flash", "harsh lighting", "hard lighting", "harsh shadows", "hard shadows", "strobe"]
  },
  {
    key: "soft",
    canonical: "soft lighting",
    patterns: ["diffused lighting", "ambient lighting", "diffused ambient", "soft illumination", "gentle lighting", "soft lighting", "soft shadows"]
  }
];

const COLOR_TONE_PATTERNS: PatternDef[] = [
  {
    key: "warm",
    canonical: "warm tones",
    patterns: ["golden hour", "warm lighting", "warm ambient", "amber lighting", "warm tones"]
  },
  {
    key: "cool",
    canonical: "cool tones",
    patterns: ["blue hour", "cool lighting", "cyan lighting", "cool ambient", "cool tones"]
  },
  {
    key: "neutral",
    canonical: "neutral lighting",
    patterns: ["neutral lighting", "neutral tones", "daylight white"]
  }
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanFormatting(prompt: string): string {
  let cleaned = prompt;
  // Clean double commas & comma spacing
  cleaned = cleaned.replace(/\s*,\s*/g, ", ");
  cleaned = cleaned.replace(/,\s*,+/g, ",");
  cleaned = cleaned.replace(/^,\s*/, "").replace(/,\s*$/, "");
  // Clean double periods & spaces
  cleaned = cleaned.replace(/\.\s*\./g, ".");
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/\s*,\s*\./g, ".");
  return cleaned.trim();
}

function deduplicateTokens(prompt: string): string {
  if (!prompt) return prompt;

  // Handle comma-separated token list
  if (prompt.includes(",")) {
    const parts = prompt.split(",").map(p => p.trim()).filter(Boolean);
    const seen = new Set<string>();
    const uniqueParts: string[] = [];
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueParts.push(part);
      }
    }
    return uniqueParts.join(", ");
  }

  // Handle natural sentence duplicate words
  const words = prompt.split(" ");
  const deduplicatedWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && words[i].toLowerCase() === words[i - 1].toLowerCase() && words[i].length > 3) {
      continue;
    }
    deduplicatedWords.push(words[i]);
  }
  return deduplicatedWords.join(" ");
}

/**
 * Sanitizes a single conflict group (e.g. angle, framing, quality, color)
 */
function processConflictGroup(
  currentPrompt: string,
  groupDefs: PatternDef[],
  structuredPreference: string | undefined,
  engineName: string,
  logs: string[],
  groupName: string
): string {
  let text = currentPrompt;
  const lowerText = text.toLowerCase();

  // Find all matched patterns and their index in the text
  interface MatchInfo {
    defKey: string;
    canonical: string;
    matchedPattern: string;
    index: number;
  }

  const matches: MatchInfo[] = [];

  for (const def of groupDefs) {
    for (const pattern of def.patterns) {
      const idx = lowerText.indexOf(pattern.toLowerCase());
      if (idx !== -1) {
        matches.push({
          defKey: def.key,
          canonical: def.canonical,
          matchedPattern: pattern,
          index: idx
        });
      }
    }
  }

  if (matches.length <= 1) {
    return text; // No conflict within this group
  }

  // Check unique key classes matched
  const uniqueKeys = Array.from(new Set(matches.map(m => m.defKey)));
  if (uniqueKeys.length <= 1) {
    return text; // Multiple patterns from same class, handled by deduplication
  }

  // Determine winner key class
  let winnerKey = uniqueKeys[0];
  let winnerSource = "first specified token";
  let winnerLabel = matches.find(m => m.defKey === winnerKey)?.matchedPattern || winnerKey;

  if (structuredPreference) {
    const lowerPref = structuredPreference.toLowerCase();
    // Normalization mapping for structured preference (e.g., "FULL_BODY" -> "full_body")
    const prefNorm = lowerPref.includes("full") ? "full_body" :
                     lowerPref.includes("half") || lowerPref.includes("medium") ? "medium_shot" :
                     lowerPref.includes("close") ? "close_up" :
                     lowerPref.includes("eye") ? "eye_level" :
                     lowerPref.includes("low") ? "low_angle" :
                     lowerPref.includes("high") ? "high_angle" :
                     lowerPref.includes("hard") || lowerPref.includes("flash") || lowerPref.includes("directional") ? "hard" :
                     lowerPref.includes("soft") || lowerPref.includes("ambient") || lowerPref.includes("diffused") ? "soft" :
                     lowerPref.includes("warm") ? "warm" :
                     lowerPref.includes("cool") ? "cool" : "";

    const matchedDef = groupDefs.find(def => 
      def.key === prefNorm || 
      def.patterns.some(p => lowerPref.includes(p.toLowerCase())) ||
      def.canonical.toLowerCase() === lowerPref
    );

    if (matchedDef && uniqueKeys.includes(matchedDef.key)) {
      winnerKey = matchedDef.key;
      winnerSource = "structured fact";
      const winMatch = matches.find(m => m.defKey === winnerKey);
      winnerLabel = winMatch ? winMatch.matchedPattern : matchedDef.canonical;
    }
  } else {
    // If no explicit structured fact, sort matches by position index
    matches.sort((a, b) => a.index - b.index);
    winnerKey = matches[0].defKey;
    winnerLabel = matches[0].matchedPattern;
  }

  // Remove all tokens from loser keys
  const loserKeys = uniqueKeys.filter(k => k !== winnerKey);

  for (const loserKey of loserKeys) {
    const loserDefs = groupDefs.filter(def => def.key === loserKey);
    for (const def of loserDefs) {
      for (const pattern of def.patterns) {
        const regex = new RegExp(`\\b${escapeRegExp(pattern)}\\b`, "gi");
        if (regex.test(text)) {
          text = text.replace(regex, "");
          const logMsg = `[PromptSanitizer] Removed '${pattern}' from ${engineName}: conflicts with '${winnerLabel}' (${winnerSource})`;
          logs.push(logMsg);
          console.log(logMsg);
        }
      }
    }
  }

  return text;
}

/**
 * Sanitizes a positive prompt by eliminating contradictory camera angles, framing,
 * lighting quality, and color temperatures based on structured source priority.
 */
export function sanitizePromptConflicts(
  prompt: string,
  context: SanitizerContext = {},
  engineName: string = "compiler"
): SanitizerResult {
  if (!prompt || typeof prompt !== "string") {
    return { sanitizedPrompt: prompt || "", logs: [] };
  }

  const logs: string[] = [];
  let result = prompt;

  // 1. Camera Angle / Elevation Group
  result = processConflictGroup(
    result,
    ANGLE_PATTERNS,
    context.structuredAngle,
    engineName,
    logs,
    "angle"
  );

  // 2. Framing / Subject Coverage Group
  result = processConflictGroup(
    result,
    FRAMING_PATTERNS,
    context.structuredFraming,
    engineName,
    logs,
    "framing"
  );

  // 3. Lighting Quality / Dominance Group
  result = processConflictGroup(
    result,
    LIGHTING_QUALITY_PATTERNS,
    context.structuredLightingQuality,
    engineName,
    logs,
    "lighting_quality"
  );

  // 4. Lighting Temperature / Palette Group (with Mixed Lighting Exception)
  const isMixed = context.isMixedLighting || 
    /mixed lighting|mixed illumination|mixed color|mixed tones/i.test(prompt) ||
    /mixed lighting|mixed illumination|mixed color/i.test(context.structuredColorTone || "");

  if (!isMixed) {
    result = processConflictGroup(
      result,
      COLOR_TONE_PATTERNS,
      context.structuredColorTone,
      engineName,
      logs,
      "color_tone"
    );
  } else {
    // Under mixed lighting, strip isolated conflicting single-dominance claims if present alongside mixed
    if (context.structuredColorTone && !context.structuredColorTone.toLowerCase().includes("mixed")) {
      result = processConflictGroup(
        result,
        COLOR_TONE_PATTERNS,
        context.structuredColorTone,
        engineName,
        logs,
        "color_tone"
      );
    }
  }

  // 5. Clean formatting and deduplicate
  result = cleanFormatting(result);
  result = deduplicateTokens(result);

  return {
    sanitizedPrompt: result,
    logs
  };
}
