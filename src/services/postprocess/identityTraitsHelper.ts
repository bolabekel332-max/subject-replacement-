/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IdentityTraitsResult {
  faceShape: string;
  hair: string;
  expression: string;
  allTraits: string[];
}

/**
 * Shared utility to extract clean, valid Level-1 identity traits (face_shape, hair, expression)
 * for use in prompt generation for Stable Diffusion and Midjourney.
 * Nano Banana uses equivalent inline filtering.
 */
export function extractValidIdentityTraits(prompts?: {
  face_shape?: string;
  hair?: string;
  expression?: string;
  [key: string]: any;
}): IdentityTraitsResult {
  const result: IdentityTraitsResult = {
    faceShape: "",
    hair: "",
    expression: "",
    allTraits: []
  };

  if (!prompts) return result;

  const isValid = (val?: string): boolean => {
    if (!val || typeof val !== "string") return false;
    const clean = val.trim().toLowerCase();
    if (!clean) return false;
    if (
      clean.includes("not clearly") || 
      clean.includes("unclear") || 
      clean.includes("n/a") || 
      clean.includes("unknown") ||
      clean.includes("not visible")
    ) {
      return false;
    }
    return true;
  };

  if (isValid(prompts.face_shape)) {
    const raw = prompts.face_shape!.trim();
    result.faceShape = /face/i.test(raw) ? raw : `${raw} face`;
    result.allTraits.push(result.faceShape);
  }

  if (isValid(prompts.hair)) {
    const raw = prompts.hair!.trim();
    result.hair = /hair/i.test(raw) ? raw : `${raw} hair`;
    result.allTraits.push(result.hair);
  }

  if (isValid(prompts.expression)) {
    const raw = prompts.expression!.trim();
    result.expression = /expression|smile|gaze|frown|look|stare|laugh/i.test(raw) ? raw : `${raw} expression`;
    result.allTraits.push(result.expression);
  }

  return result;
}



