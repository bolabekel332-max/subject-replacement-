import { AIResponse, GenerationResult, Style } from "../types/app";

export interface UniversalPromptContext {
  style?: Style;
  chatTrigger?: string;
  isMultiSubject?: boolean;
  targetSubjectRole?: string;
  subjectAttributes?: string;
}

export interface UniversalPromptOutput {
  prompt: string;
  negative: string;
}

function cleanMetaJargon(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(POSE CONTROL ENGINE|ANATOMY AUTHORITY|SUBJECT INTEGRITY|VISUAL SIMULATION|EXECUTION STRATEGY & LOCK)\b/gi, "")
    .replace(/🚨.*?🚨/g, "")
    .replace(/\[ROLE\][\s\S]*?\[\/ROLE\]/gi, "")
    .replace(/\b(basic|advanced|expert)\b/gi, "")
    .replace(/\(\s*[^:]+:\s*\d+(\.\d+)?\s*\)/g, "")
    .replace(/--\w+(\s+\S+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure renderer for Universal Raw Prompt.
 * Converts sanitized generation result into a clean, portable natural prose prompt.
 * Zero model calls, zero engine-specific syntax.
 */
export function buildUniversalPrompt(
  result: GenerationResult,
  rawAnalysis?: AIResponse,
  ctx?: UniversalPromptContext
): UniversalPromptOutput {
  const parts: string[] = [];

  // 1. Style Prefix
  const styleStr = ctx?.style || 'realistic';
  let styleDescriptor = "A realistic high-resolution photograph";
  if (styleStr === 'cinematic') {
    styleDescriptor = "A cinematic film-still photograph";
  } else if (styleStr === 'dramatic') {
    styleDescriptor = "A dramatic high-contrast photograph";
  }

  // 2. Subject Noun & Role
  let subjectNoun = "a subject";
  if (ctx?.isMultiSubject && ctx?.targetSubjectRole) {
    subjectNoun = `the subject (${ctx.targetSubjectRole})`;
  }

  const promptsData = rawAnalysis?.prompts || {};
  const analysisData: { lighting?: string; angle?: string; environment?: string } = rawAnalysis?.analysis || result.analysis || {};

  // 3. Facial & Physical Identity Traits
  const identityDetails: string[] = [];
  if (promptsData.skin_tone) {
    const cleanSkin = cleanMetaJargon(promptsData.skin_tone);
    if (cleanSkin) identityDetails.push(`skin tone: ${cleanSkin}`);
  }
  if (promptsData.face_shape) {
    const cleanFace = cleanMetaJargon(promptsData.face_shape);
    if (cleanFace) identityDetails.push(`facial structure: ${cleanFace}`);
  }
  if (promptsData.hair) {
    const cleanHair = cleanMetaJargon(promptsData.hair);
    if (cleanHair) identityDetails.push(`hairstyle: ${cleanHair}`);
  }
  if (promptsData.expression) {
    const cleanExpr = cleanMetaJargon(promptsData.expression);
    if (cleanExpr) identityDetails.push(`expression: ${cleanExpr}`);
  }

  let identitySentence = `${styleDescriptor} of ${subjectNoun}`;
  if (identityDetails.length > 0) {
    identitySentence += `, featuring ${identityDetails.join(", ")}`;
  }
  identitySentence += ".";
  parts.push(identitySentence);

  // Extra attributes if available
  if (ctx?.subjectAttributes) {
    const cleanAttr = cleanMetaJargon(ctx.subjectAttributes.replace(/^Subject attributes:\s*/i, ""));
    if (cleanAttr && !cleanAttr.toLowerCase().includes("auto")) {
      parts.push(`Physical characteristics: ${cleanAttr}.`);
    }
  }

  // 4. Pose & Stance
  if (promptsData.pose) {
    const cleanPoseStr = cleanMetaJargon(promptsData.pose);
    if (cleanPoseStr) {
      parts.push(`Pose and posture: ${cleanPoseStr}.`);
    }
  }

  // 5. Outfit & Attire
  if (promptsData.outfit) {
    const cleanOutfitStr = cleanMetaJargon(promptsData.outfit);
    if (cleanOutfitStr) {
      parts.push(`Outfit and clothing: ${cleanOutfitStr}.`);
    }
  }

  // 6. Environment & Scene Background
  if (analysisData.environment) {
    const cleanEnvStr = cleanMetaJargon(analysisData.environment);
    if (cleanEnvStr) {
      parts.push(`Environment setting: ${cleanEnvStr}.`);
    }
  }

  // 7. Lighting
  const lightingParts: string[] = [];
  if (analysisData.lighting) {
    const cleanLight = cleanMetaJargon(analysisData.lighting);
    if (cleanLight) lightingParts.push(cleanLight);
  }
  if (promptsData.lighting_type && promptsData.lighting_type !== analysisData.lighting) {
    const cleanLightType = cleanMetaJargon(promptsData.lighting_type);
    if (cleanLightType) lightingParts.push(cleanLightType);
  }
  if (promptsData.color_tones) {
    const cleanTone = cleanMetaJargon(promptsData.color_tones);
    if (cleanTone) lightingParts.push(`color tones: ${cleanTone}`);
  }

  if (lightingParts.length > 0) {
    parts.push(`Lighting: ${lightingParts.join(", ")}.`);
  }

  // 8. Camera Angle & Framing
  if (analysisData.angle) {
    const cleanAngleStr = cleanMetaJargon(analysisData.angle);
    if (cleanAngleStr) {
      parts.push(`Camera angle and perspective: ${cleanAngleStr}.`);
    }
  }

  // 9. User Directive (Chat Trigger)
  if (ctx?.chatTrigger && ctx.chatTrigger.trim()) {
    const cleanTriggerStr = cleanMetaJargon(ctx.chatTrigger.trim());
    if (cleanTriggerStr) {
      parts.push(`Special user instruction: ${cleanTriggerStr}.`);
    }
  }

  const universalPromptText = parts.join(" ");

  // 10. Negative Prompt
  let rawNegative = promptsData.negative || result.nano?.negative || "";
  const universalNegativeText = cleanMetaJargon(rawNegative);

  return {
    prompt: universalPromptText,
    negative: universalNegativeText
  };
}
