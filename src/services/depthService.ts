
export type DepthResult = {
  depthMap: Float32Array;   // procedural scene-level depth gradient (scene analysis estimation, not per-pixel measurement)
  width: number;
  height: number;
  subjectDepth: number;     // rata-rata depth subject
  groundDepth: number;      // depth area kaki / lantai
};
