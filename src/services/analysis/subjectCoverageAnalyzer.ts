
import { DetectionResult } from "../detectionService";

export type SubjectCoverage = 'FULL_BODY' | 'HALF_BODY' | 'NOT_DETECTED' | 'INVALID_REFERENCE';

export type SubjectReferenceStack = {
  primaryFace?: any;
  halfBody?: any;
  fullBody?: any;
};

export function validateReferenceStack(stack: SubjectReferenceStack) {
  const score =
    Number(!!stack.primaryFace) +
    Number(!!stack.halfBody) +
    Number(!!stack.fullBody);

  if (score < 2) {
    return {
      valid: false,
      reason: "MULTI-REFERENCE REQUIRED: use FACE + HALF_BODY minimum"
    };
  }

  return {
    valid: true,
    score
  };
}

export interface CoverageResult {
  coverage: SubjectCoverage;
  logic: string;
}

/**
 * PHASE S6 — SUBJECT COVERAGE ANALYZER V1
 * Detects the completeness of the subject reference image to adjust anatomy authority dynamically.
 */
export async function analyzeSubjectCoverage(detection: DetectionResult | null): Promise<CoverageResult> {
  if (!detection || !detection.primary) {
    return {
      coverage: 'NOT_DETECTED',
      logic: 'No subject detected in reference image.'
    };
  }

  const primary = detection.primary;
  const subjects = detection.subjects;
  
  // Find face associated with primary person if primary is a person
  let face = primary.type === 'face' ? primary : subjects.find(s => s.type === 'face' && 
    s.bbox.x >= primary.bbox.x && 
    s.bbox.x + s.bbox.w <= primary.bbox.x + primary.bbox.w &&
    s.bbox.y >= primary.bbox.y &&
    s.bbox.y + s.bbox.h <= primary.bbox.y + primary.bbox.h
  );

  if (!face) {
    // If no face found but person detected, assume FULL_BODY or HALF_BODY based on bbox height
    if (primary.bbox.h > 700) {
        return { coverage: 'FULL_BODY', logic: 'High vertical occupancy (Full Body fallback), person detected without clear face anchor.' };
    }
    return { coverage: 'HALF_BODY', logic: 'Medium vertical occupancy (Half Body fallback), person detected without clear face anchor.' };
  }

  // Calculate face-to-body ratios
  // In normalized coordinates (0-1000)
  const faceHeight = face.bbox.h;
  const totalPersonHeight = primary.type === 'person' ? primary.bbox.h : face.bbox.h;
  const ratio = faceHeight / totalPersonHeight;

  // DETAILED COVERAGE HEURISTICS:
  
  // 1. FACE_ONLY: Face dominates the vertical space -> UNSTABLE REJECT
  if (primary.type === 'face' || ratio > 0.6) {
    return { 
        coverage: 'INVALID_REFERENCE', 
        logic: 'Subject primary region is exclusively facial (Ratio: ' + ratio.toFixed(2) + '). PHASE D24 REJECT.' 
    };
  }
  
  // 2. SHOULDER_UP: Face is 25-60% of visible space -> UNSTABLE REJECT
  if (ratio > 0.25) {
    return { 
        coverage: 'INVALID_REFERENCE', 
        logic: 'Subject visible from shoulders up (Ratio: ' + ratio.toFixed(2) + '). PHASE D24 REJECT.' 
    };
  }

  // 3. HALF_BODY: Face is 12-25% of visible space
  if (ratio > 0.12) {
    return { 
        coverage: 'HALF_BODY', 
        logic: 'Subject visible from torso up (Ratio: ' + ratio.toFixed(2) + ').' 
    };
  }

  // 4. FULL_BODY: Face is small (< 12%) relative to visible body
  return { 
    coverage: 'FULL_BODY', 
    logic: 'Subject visible in full body proportion (Ratio: ' + ratio.toFixed(2) + ').' 
  };
}
