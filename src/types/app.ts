export type OutputMode = 'nano';
export type PoseMode = 'LOCKED' | 'BLEND' | 'FREE' | 'AUTO';
export type EnvPreset = 'STUDIO' | 'OUTDOOR' | 'CINEMATIC' | 'DAYLIGHT' | 'STREET';
export type AtmosPreset = 'NONE' | 'FOG' | 'GOLDEN_HOUR' | 'NEON' | 'DRAMATIC';
export type Style = 'realistic' | 'cinematic' | 'dramatic';
export type NanoVariant = 'basic' | 'advanced' | 'expert';

export type AnatomyProfile = {
  heightCm?: number;
  weightKg?: number;
  visualHeight?: string;
  buildType?: string;
  bodyFrame?: string;
  shoulderWidth?: string;
  torsoRatio?: string;
  legProportion?: string;
  bmiCategory?: string;
  gender?: "male" | "female" | "universal";
  templateId?: string;
  physicalTraits?: string[];
};

export interface AIResponse {
  analysis: {
    lighting: string;
    angle: string;
    environment: string;
  };
  prompts?: {
    lighting_type?: string;
    color_tones?: string;
    pose?: string;
    outfit?: string;
    negative?: string;
    skin_tone?: string;
    face_shape?: string;
    hair?: string;
    expression?: string;
    prompt?: string;
  };
  simulation?: string;
}

export interface GenerationResult {
  analysis: {
    lighting: string;
    angle: string;
    environment: string;
  };
  nano: {
    basic: string;
    advanced: string;
    expert: string;
    negative: string;
  };
  sd?: {
    prompt: string;
    negative: string;
  };
  mj?: {
    prompt: string;
  };
  simulation: string;
  subjectAttributes?: string;
  cleanedScene?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  result: GenerationResult;
  mainImage: string | null;
  replacementImage: string | null;
  outfitImage?: string | null;
  mainFileName?: string;
  replacementFileName?: string;
  outfitFileName?: string;
  replacementDetection?: any;
  style: Style;
  outputMode: OutputMode;
}

export interface CheckpointData {
  data: AIResponse;
  context: {
    mainDetection: any;
    replacementDetection: any;
    mainPose: any;
    replacementPose: any;
    mainFileName: string;
    replacementFileName: string;
    outfitImage: string | null;
    outfitFileName: string;
    targetPoseMode: PoseMode;
    targetEnvPreset: EnvPreset;
    targetAtmosPreset: AtmosPreset;
    anatomyProfile: AnatomyProfile | null;
    targetMode: OutputMode;
    cleanedScene: string;
    reconstructedScene: string;
    isMultiSubject: boolean;
    targetSubjectRole: string;
    targetStyle: Style;
    autoLightingStr: string;
    sanitize: (text: string) => string;
    attributes: string;
    coverageOverride?: any;
    chatTrigger?: string;
  };
}
