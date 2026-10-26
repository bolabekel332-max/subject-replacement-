
import * as tf from '@tensorflow/tfjs-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { initTF } from './tfService';

export type Keypoint = {
  name?: string;
  x: number;
  y: number;
  score: number;
};

export type PoseResult = {
  keypoints: Keypoint[];
  skeleton: [string, string][];
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
};

let detector: poseDetection.PoseDetector | null = null;
let modelLoadPromise: Promise<poseDetection.PoseDetector> | null = null;

/**
 * 4. POSE ENGINE GUARD (WAJIB)
 */
async function safeLoadPoseModel(retries = 3, delay = 2000) {
  const backend = tf.getBackend();

  if (!backend) {
    throw new Error("[VISION] TF Backend NOT READY");
  }

  if (detector) return detector;
  if (modelLoadPromise) return modelLoadPromise;

  const attemptLoad = async (remaining: number): Promise<poseDetection.PoseDetector> => {
    try {
      const det = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
      );
      detector = det;
      modelLoadPromise = null;
      return det;
    } catch (err) {
      if (remaining > 0) {
        console.warn(`[Pose Engine] Load failed, retrying in ${delay}ms... (${remaining} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptLoad(remaining - 1);
      }
      modelLoadPromise = null;
      throw err;
    }
  };

  modelLoadPromise = attemptLoad(retries);
  return modelLoadPromise;
}

// Aliasing existing loadModel to use the safer pattern
const loadModel = safeLoadPoseModel;

const skeletonEdges: [string, string][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"]
];

function computeBBox(keypoints: Keypoint[]) {
  const xs = keypoints.filter(k => k.score > 0.3).map(k => k.x);
  const ys = keypoints.filter(k => k.score > 0.3).map(k => k.y);

  if (xs.length === 0 || ys.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

export function validateImage(input: any) {
  if (!input) throw new Error("Image missing");
  if (typeof input !== 'string') throw new Error("Invalid format");
  if (!input.startsWith('http') && !input.startsWith('data:')) {
    throw new Error("Unsupported image source (must be URL or Base64)");
  }
}

export async function runPoseEngine(src: string): Promise<PoseResult | null> {
  try {
    validateImage(src);
    const detector = await loadModel();
    
    // Create image element to process
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.src = src;
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to load image for Pose Engine"));
    });

    const poses = await detector.estimatePoses(img);
    
    if (!poses || poses.length === 0) return null;

    const pose = poses[0];
    const keypoints: Keypoint[] = pose.keypoints.map(k => ({
      name: k.name,
      x: (k.x / img.width) * 1000,
      y: (k.y / img.height) * 1000,
      score: k.score || 0
    }));

    const validKeypoints = keypoints.filter(k => k.score > 0.3).length;
    const confidence = validKeypoints / keypoints.length;

    if (confidence < 0.3) return null;

    const bbox = computeBBox(keypoints);

    return {
      keypoints,
      skeleton: skeletonEdges,
      bbox,
      confidence
    };
  } catch (error) {
    console.error("Pose Engine Error:", error);
    return null;
  }
}
