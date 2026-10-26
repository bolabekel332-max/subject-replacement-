import { DetectionResult, SubjectDetection } from '../detectionService';
import { PoseResult, Keypoint } from '../poseService';
import { AIResponse } from '../../types/app';

export interface LocalAnchorContext {
  mainDetection: DetectionResult | null;
  replacementDetection: DetectionResult | null;
  mainPose: PoseResult | null;
  replacementPose: PoseResult | null;
}

export interface CoverageOverride {
  coverage: 'FULL_BODY' | 'HALF_BODY';
  logic: string;
}

export interface ReconciledAnalysisResult {
  data: AIResponse;
  reconciledLogs: string[];
  replacementCoverageOverride?: CoverageOverride;
  effectivePoseText: string;
  hasMainSubjectAnchor: boolean;
  hasReplacementSubjectAnchor: boolean;
}

export const LOCAL_DETECTION_CONFIDENCE_THRESHOLD = 0.20;

/**
 * Derives a human-readable pose description from MoveNet keypoints.
 */
export function derivePoseDescriptionFromKeypoints(pose: PoseResult | null): string {
  if (!pose || !pose.keypoints || pose.keypoints.length === 0 || pose.confidence < 0.25) {
    return "";
  }

  const findKp = (name: string) => pose.keypoints.find(k => k.name === name && k.score > 0.3);

  const leftShoulder = findKp('left_shoulder');
  const rightShoulder = findKp('right_shoulder');
  const leftElbow = findKp('left_elbow');
  const rightElbow = findKp('right_elbow');
  const leftWrist = findKp('left_wrist');
  const rightWrist = findKp('right_wrist');
  const leftHip = findKp('left_hip');
  const rightHip = findKp('right_hip');

  const traits: string[] = [];

  // Shoulder inclination / stance
  if (leftShoulder && rightShoulder) {
    const shoulderAngle = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderAngle > 40) {
      traits.push("tilted shoulder posture");
    } else {
      traits.push("level shoulder stance");
    }
  }

  // Arm position relative to hips/torso
  if (leftWrist && leftHip && Math.abs(leftWrist.y - leftHip.y) < 60) {
    traits.push("left hand near hip");
  }
  if (rightWrist && rightHip && Math.abs(rightWrist.y - rightHip.y) < 60) {
    traits.push("right hand near hip");
  }

  if (leftWrist && leftShoulder && leftWrist.y < leftShoulder.y) {
    traits.push("raised left arm");
  }
  if (rightWrist && rightShoulder && rightWrist.y < rightShoulder.y) {
    traits.push("raised right arm");
  }

  if (traits.length === 0) {
    traits.push("natural body posture");
  }

  return `Local MoveNet anchor: ${traits.join(", ")}`;
}

/**
 * TAHAP 1 RECONCILIATION LAYER
 * Reconciles local vision engine measurements (MoveNet/BodyPix) with LLM analysis output.
 */
export function reconcileLocalWithLLM(
  llmData: AIResponse,
  local: LocalAnchorContext
): ReconciledAnalysisResult {
  const logs: string[] = [];
  const reconciledData: AIResponse = {
    analysis: { ...llmData.analysis },
    prompts: { ...llmData.prompts },
    simulation: llmData.simulation || ""
  };

  // 1. Evaluate Main Scene Local Detection Anchor
  const mainPrimary = local.mainDetection?.primary;
  const hasMainSubjectAnchor = !!(mainPrimary && typeof mainPrimary.confidence === 'number' && mainPrimary.confidence >= LOCAL_DETECTION_CONFIDENCE_THRESHOLD);

  if (hasMainSubjectAnchor && mainPrimary) {
    const isLLMMainMissing = !llmData.analysis?.environment || llmData.analysis.environment.toLowerCase().includes("not detected") || llmData.analysis.environment.toLowerCase().includes("no person");
    if (isLLMMainMissing) {
      logs.push(`[Reconcile] Local detection overrides LLM subject-not-detected for main scene: confidence ${mainPrimary.confidence?.toFixed(2) ?? 'n/a'}`);
      if (!reconciledData.analysis.environment) {
        reconciledData.analysis.environment = "Main scene subject anchored by local MoveNet/BodyPix detection.";
      }
    }
  } else {
    logs.push(`[Reconcile] Main scene local detection weak or absent (confidence < ${LOCAL_DETECTION_CONFIDENCE_THRESHOLD}); preserving LLM analysis.`);
  }

  // 2. Evaluate Replacement Subject Local Detection Anchor
  const replacementPrimary = local.replacementDetection?.primary;
  const hasReplacementSubjectAnchor = !!(replacementPrimary && typeof replacementPrimary.confidence === 'number' && replacementPrimary.confidence >= LOCAL_DETECTION_CONFIDENCE_THRESHOLD);

  let replacementCoverageOverride: CoverageOverride | undefined = undefined;

  if (hasReplacementSubjectAnchor && replacementPrimary) {
    const isLLMReplacementMissing = !llmData.prompts?.pose || llmData.prompts.pose.toLowerCase().includes("not detected") || llmData.prompts.pose.toLowerCase().includes("no subject");
    
    // Create coverage override to protect against LLM false-negatives in analyzeSubjectCoverage
    replacementCoverageOverride = {
      coverage: replacementPrimary.bbox.h > 700 ? 'FULL_BODY' : 'HALF_BODY',
      logic: `Local detection anchor active (confidence ${replacementPrimary.confidence?.toFixed(2) ?? 'n/a'}).`
    };

    if (isLLMReplacementMissing) {
      logs.push(`[Reconcile] Local detection overrides LLM subject-not-detected for replacement subject: confidence ${replacementPrimary.confidence?.toFixed(2) ?? 'n/a'}`);
    }
  } else {
    logs.push(`[Reconcile] Replacement subject local detection weak or absent; preserving LLM analysis.`);
  }

  // 3. Pose Reconciliation & Conflict Resolution
  const localPoseDesc = derivePoseDescriptionFromKeypoints(local.mainPose || local.replacementPose);
  let effectivePoseText = llmData.prompts?.pose || "";

  if (localPoseDesc) {
    if (effectivePoseText) {
      logs.push(`[Reconcile] Pose conflict resolved: local MoveNet pose keypoint anchor prioritized over LLM pose text ("${effectivePoseText}").`);
      effectivePoseText = `${localPoseDesc} | ${effectivePoseText}`;
    } else {
      logs.push(`[Reconcile] Local MoveNet pose anchor applied for missing LLM pose prompt.`);
      effectivePoseText = localPoseDesc;
    }
    if (reconciledData.prompts) {
      reconciledData.prompts.pose = effectivePoseText;
    }
  }

  logs.forEach(msg => console.log(msg));

  return {
    data: reconciledData,
    reconciledLogs: logs,
    replacementCoverageOverride,
    effectivePoseText,
    hasMainSubjectAnchor,
    hasReplacementSubjectAnchor
  };
}
