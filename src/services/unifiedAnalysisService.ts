
import { Type } from "@google/genai";
import { safeGenerateContent } from "./geminiService";
import { extractJSON } from "../lib/jsonExtract";
import { DetectionResult, SubjectDetection } from "./detectionService";
import { DepthResult } from "./depthService";

export interface UnifiedAnalysisResult {
  detection: DetectionResult | null;
  depth: DepthResult | null;
}

/**
 * Unified Vision Analysis Service
 * Merges multiple Gemini calls into one to save API quota.
 */
export async function runUnifiedAnalysis(imgSrc: string): Promise<UnifiedAnalysisResult> {
  try {
    const base64Data = imgSrc.includes('base64,') ? imgSrc.split('base64,')[1] : imgSrc;
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/jpeg",
      },
    };

    const prompt = `Analyze this image for spatial depth and subject detection.
    
    TASKS:
    1. Detect all persons and faces. Return normalized bboxes [ymin, xmin, ymax, xmax] (0-1000).
    2. Analyze spatial depth. Estimate subjectDepth (0=front, 1=back), groundDepth (floor level), and horizonDepth. 
    3. Return subjectCenter: {x, y} coordinate of the primary subject.

    Output ONLY a JSON object:
    {
      "detections": [
        {"bbox": [ymin, xmin, ymax, xmax], "type": "face" | "person", "confidence": 0.95}
      ],
      "depth": {
        "subjectDepth": 0.4,
        "groundDepth": 0.6,
        "horizonDepth": 1.0,
        "subjectCenter": {"x": 500, "y": 600}
      }
    }`;

    console.log("[UnifiedAnalysis] Dispatching merged request to OpenRouter...");
    const response = await safeGenerateContent({
      contents: [{ 
        parts: [
          { text: prompt },
          imagePart
        ]
      }],
      config: {
        temperature: 0.15,
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty AI response");

    const data = JSON.parse(extractJSON(text));
    
    // 1. Process Detections
    const subjects: SubjectDetection[] = (data.detections || []).map((d: any) => ({
      bbox: {
        y: d.bbox[0],
        x: d.bbox[1],
        h: d.bbox[2] - d.bbox[0],
        w: d.bbox[3] - d.bbox[1]
      },
      confidence: typeof d.confidence === 'number' ? d.confidence : null,
      type: d.type || 'person'
    }));

    const detection: DetectionResult | null = subjects.length > 0 ? {
      subjects,
      primary: [...subjects].sort((a,b) => (b.bbox.w * b.bbox.h) - (a.bbox.w * a.bbox.h))[0]
    } : null;

    // 2. Process Depth (Scene-level scalar estimation gradient, NOT per-pixel depth measurement)
    const depthMap = new Float32Array(512 * 512);
    const spatialData = data.depth || { subjectDepth: 0.5, groundDepth: 0.5, horizonDepth: 1.0 };
    
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const i = y * 512 + x;
        const normalizedY = y / 512;
        let baseDepth = normalizedY < 0.5 
          ? 1.0 - (normalizedY * 2 * (1.0 - spatialData.horizonDepth))
          : spatialData.groundDepth - ((normalizedY - 0.5) * 2 * spatialData.groundDepth);
        depthMap[i] = Math.max(0, Math.min(1, baseDepth));
      }
    }

    const depth: DepthResult = {
      depthMap,
      width: 512,
      height: 512,
      subjectDepth: spatialData.subjectDepth,
      groundDepth: spatialData.groundDepth
    };

    return { detection, depth };
  } catch (err) {
    console.error("[UnifiedAnalysis] Failure:", err);
    return { detection: null, depth: null };
  }
}
