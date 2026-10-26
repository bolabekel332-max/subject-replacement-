/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Type } from "@google/genai";
import { safeGenerateContent, QueueCancelledError } from "./services/geminiService";
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw, 
  Info,
  Layers,
  Zap,
  ShieldAlert,
  ChevronRight,
  Move,
  User,
  Download,
  Plus,
  Link,
  Target,
  Crop,
  UserCheck,
  Maximize2,
  Scissors,
  Eye,
  EyeOff,
  Box,
  Camera,
  Users,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { exportPDFV6 } from './lib/pdfExport';
import { PromptCard } from './components/PromptCard';
import { UniversalPromptCard } from './components/UniversalPromptCard';
import { buildUniversalPrompt } from './services/universalPromptService';
import { NanoVariant, AnatomyProfile, CheckpointData, GenerationResult, OutputMode, AIResponse } from './types/app';
import { reconstructImageWithAssets } from './services/imageGenerationService';
import { DetectionResult } from './services/detectionService';
import { DepthResult } from './services/depthService';
import { PoseResult } from './services/poseService';
import { extractJSON } from './lib/jsonExtract';
import { runVisionEnginesSafe, normalizeImageInput } from './services/visionRunner';
import { suppressTFLogs } from './services/tfService';
import { generateEmptyScene } from './services/preprocess/emptySceneGenerator';
import { buildSubjectGeneration } from './services/pipeline/subjectGenerationStage';
import { buildTrueHumanSilhouettePreClean } from './services/preprocess/trueHumanSilhouettePreClean';
import { buildSceneImmutabilityLock } from './services/pipeline/sceneImmutabilityLock';
import { buildPhysicalEmptySceneReconstruction } from './services/preprocess/physicalEmptySceneReconstruction';
import { analyzeSubjectCoverage } from './services/analysis/subjectCoverageAnalyzer';
import { sanitizePromptStructure } from './services/postprocess/promptSanitizer';
import { stabilizePromptStructure } from './services/postprocess/structureStabilizer';
import { asianBodyProfiles } from './data/asianBodyProfiles';
import { reconcileLocalWithLLM, CoverageOverride } from './services/reconciliation/detectionReconciler';
import { sanitizePromptConflicts, SanitizerContext } from './services/postprocess/promptConflictSanitizer';
import { extractValidIdentityTraits } from './services/postprocess/identityTraitsHelper';
import { generateDeterministicSimulation, isMetaInstruction } from './services/postprocess/simulationHelper';
import { translateChatTrigger, formatChatTriggerForEngine } from './services/postprocess/chatTriggerTokens';

// --- SILENT MODE (REDUCE NOISE) ---
suppressTFLogs();

// --- Types ---



interface Analysis {
  lighting: string;
  angle: string;
  environment: string;
}

interface Prompts {
  basic: string;
  advanced: string;
  expert: string;
  negative: string;
}

interface SDPrompt {
  prompt: string;
  negative: string;
}

type Style = 'realistic' | 'cinematic' | 'dramatic';

// --- Utilities ---

function inferAnatomyProfile(subjectAttributes: string): AnatomyProfile {
  const profile: AnatomyProfile = {};
  const attrs = subjectAttributes.toLowerCase();

  // HEURISTIC: Heights (UPGRADED)
  if (attrs.includes("tall") || attrs.includes("towering") || attrs.includes("elongated")) profile.visualHeight = "tall";
  else if (attrs.includes("short") || attrs.includes("petite") || attrs.includes("compact")) profile.visualHeight = "short";
  else profile.visualHeight = "average";

  // HEURISTIC: Build (UPGRADED)
  if (attrs.includes("lean") || attrs.includes("thin") || attrs.includes("slender")) {
    profile.buildType = "lean medium frame";
  } else if (attrs.includes("athletic") || attrs.includes("muscular") || attrs.includes("toned")) {
    profile.buildType = "broad athletic";
  } else if (attrs.includes("stocky") || attrs.includes("heavy") || attrs.includes("large")) {
    profile.buildType = "stocky";
  } else if (attrs.includes("slim")) {
    profile.buildType = "slim";
  } else {
    profile.buildType = "lean medium frame"; // Specific default
  }

  // HEURISTIC: Frame
  if (attrs.includes("narrow") || attrs.includes("small frame")) profile.bodyFrame = "small";
  else if (attrs.includes("broad") || attrs.includes("large frame")) profile.bodyFrame = "large";
  else profile.bodyFrame = "medium";

  // HEURISTIC: Shoulders (UPGRADED)
  if (attrs.includes("broad shoulders")) profile.shoulderWidth = "broad shoulders";
  else if (attrs.includes("narrow shoulders") || attrs.includes("slanted shoulders")) profile.shoulderWidth = "narrow shoulders";
  else profile.shoulderWidth = "balanced shoulders";

  // HEURISTIC: Proportions (UPGRADED)
  if (attrs.includes("long legs")) profile.legProportion = "long leg proportion";
  else if (attrs.includes("short legs")) profile.legProportion = "short leg proportion";
  else profile.legProportion = "balanced leg proportion";

  if (attrs.includes("long torso")) profile.torsoRatio = "long torso";
  else if (attrs.includes("short torso")) profile.torsoRatio = "compact torso";
  else profile.torsoRatio = "balanced torso";

  return profile;
}

function buildPhysiqueProfile(profile: AnatomyProfile): string {
  // PATCH — SUBJECT ATTRIBUTE CONSISTENCY
  const h = (profile.visualHeight && profile.visualHeight !== "average") ? profile.visualHeight : "";
  const b = profile.buildType || "";
  const f = profile.bodyFrame && profile.bodyFrame !== "medium" ? profile.bodyFrame : "";
  
  // Ensure single consistent scale
  let scale = h;
  if (!scale && b.toLowerCase().includes("short")) scale = ""; // handled in b
  
  if (!scale && !f) return b;
  
  return `${scale} ${b} ${f}`.replace(/\s{2,}/g, " ").trim();
}

function buildAnatomyLightingWrap(profile: AnatomyProfile | null): string {
  if (!profile) return "Apply natural light wrap around the subject silhouette.";
  
  const build = (profile.buildType || "medium").toLowerCase();
  
  if (build.includes("athletic") || build.includes("muscular") || build.includes("fit")) {
    return "ANATOMY-AWARE LIGHTING WRAP: Light must wrap precisely around muscle contours and anatomical peaks, emphasizing defined structure with subtle subsurface scattering.";
  } else if (build.includes("lean") || build.includes("slim") || build.includes("thin")) {
    return "ANATOMY-AWARE LIGHTING WRAP: Light must wrap cleanly around bone structure and lean frame, with sharp shadow transitions at anatomical prominences.";
  } else if (build.includes("curvy") || build.includes("voluptuous") || build.includes("full")) {
    return "ANATOMY-AWARE LIGHTING WRAP: Light must wrap smoothly around organic curves and soft anatomical volumes, with gentle falloff reflecting natural surface geometry.";
  }
  
  return "ANATOMY-AWARE LIGHTING WRAP: Light must wrap naturally around the subject's specific body frame, preserving structural depth and realistic skin response.";
}

function buildAnatomySurfacePhysics(profile: AnatomyProfile | null): string {
  if (!profile) return "Maintain realistic surface physics and tissue behavior.";
  
  const build = (profile.buildType || "medium").toLowerCase();
  
  if (build.includes("athletic") || build.includes("muscular") || build.includes("fit")) {
    return "ANATOMY-SPECIFIC SURFACE PHYSICS: Surface must exhibit high structural tension, with skin following firm muscular topography; minimal tissue displacement during movement.";
  } else if (build.includes("lean") || build.includes("slim") || build.includes("thin")) {
    return "ANATOMY-SPECIFIC SURFACE PHYSICS: Surface must show tight adhesion to underlying bone structure; skeletal prominences drive skin surface geometry with sharp, dry transitions.";
  } else if (build.includes("curvy") || build.includes("voluptuous") || build.includes("full")) {
    return "ANATOMY-SPECIFIC SURFACE PHYSICS: Surface must exhibit realistic soft-tissue dynamics, with weight-dependent compression and natural gravitational distribution across anatomical volumes.";
  }
  
  return "ANATOMY-SPECIFIC SURFACE PHYSICS: Surface physics must reflect the specific density and mass of the target subject's frame, ensuring realistic interaction with forces and environment.";
}

function buildAnatomyMaterialInteraction(profile: AnatomyProfile | null): string {
  if (!profile) return "Ensure realistic interaction between materials and subject anatomy.";
  
  const build = (profile.buildType || "medium").toLowerCase();
  
  if (build.includes("athletic") || build.includes("muscular") || build.includes("fit")) {
    return "ANATOMY-DRIVEN MATERIAL INTERACTION: Fabric and materials must react to underlying muscular tension; sharp creasing against hard anatomical angles and stretched surface fidelity over peak volume.";
  } else if (build.includes("lean") || build.includes("slim") || build.includes("thin")) {
    return "ANATOMY-DRIVEN MATERIAL INTERACTION: Materials must drape with gravity-driven accuracy over the lean frame; expect high-contrast folding patterns near skeletal junctions and precise silhouette tracing.";
  } else if (build.includes("curvy") || build.includes("voluptuous") || build.includes("full")) {
    return "ANATOMY-DRIVEN MATERIAL INTERACTION: Fabrics must show soft-body compression and realistic wrapping around organic volumes; stress-lines must emerge naturally from anatomical curves and contact points.";
  }
  
  return "ANATOMY-DRIVEN MATERIAL INTERACTION: All materials must interact with the subject's anatomy based on realistic friction, tension, and volume displacement.";
}

function buildAdaptiveSSSPatch(lighting: string, skinTone: string): string {
  const l = (lighting || "").toLowerCase();
  const s = (skinTone || "").toLowerCase();
  
  let intensity = "subtle";
  let depth = "shallow";
  let bias = "warm neural";
  
  if (l.includes("backlit") || l.includes("sunlight") || l.includes("bright")) {
    intensity = "pronounced";
    depth = "significant";
  } else if (l.includes("studio") || l.includes("soft")) {
    intensity = "natural";
    depth = "medium";
  }
  
  if (s.includes("fair") || s.includes("pale") || s.includes("white")) {
    bias = "pinkish-red vascular glow";
  } else if (s.includes("dark") || s.includes("deep") || s.includes("black") || s.includes("brown")) {
    bias = "deep amber and warm orange scattering";
  } else {
    bias = "natural peach and blood-rich undertones";
  }
  
  return `ADAPTIVE SSS (V5): Apply ${intensity} subsurface scattering with ${depth} light penetration; light must bleed through thin tissues (ears, nostrils) with ${bias}.`;
}

function buildAtmosphericDepthPatch(environment: string): string {
  const env = (environment || "").toLowerCase();
  
  let depthCue = "clear atmospheric visibility";
  let particulates = "minimal";
  
  if (env.includes("dark") || env.includes("night") || env.includes("interior")) {
    depthCue = "density-based light falloff with deep ambient occlusion";
    particulates = "visible micro-dust in light beams";
  } else if (env.includes("outdoor") || env.includes("bright") || env.includes("street")) {
    depthCue = "proper aerial perspective and horizon-based haze";
    particulates = "natural aerial particulates and light scattering";
  } else if (env.includes("fog") || env.includes("mist") || env.includes("hazy")) {
    depthCue = "volumetric fogging with exponential height decay";
    particulates = "dense moisture suspended in volume";
  }
  
  return `ATMOSPHERIC DEPTH: Enforce ${depthCue}; ${particulates} must react to primary light sources with realistic occlusion.`;
}

function buildCameraLensFidelityPatch(camera: string): string {
  const cam = (camera || "").toLowerCase();
  
  let lensLogic = "standard rectilinear optics";
  let bloom = "natural";
  
  if (cam.includes("bokeh") || cam.includes("wide") || cam.includes("aperture")) {
    lensLogic = "optical depth of field with realistic circle-of-confusion; subtle peripheral chromatic aberration";
    bloom = "physically accurate highlight bloom";
  } else if (cam.includes("macro") || cam.includes("close")) {
    lensLogic = "micro-depth fidelity with extreme focal plane precision";
    bloom = "soft highlight diffusion";
  }
  
  return `CAMERA LENS FIDELITY: Maintain ${lensLogic}; ${bloom} response on specular peaks matching focal characteristics.`;
}

function normalizeAutoAnatomyProfile(profile: AnatomyProfile): AnatomyProfile {
  const build = (profile.buildType || "").toLowerCase();
  const frame = (profile.bodyFrame || "").toLowerCase();

  let physique = "balanced physique";

  // slim / lean
  if (build.includes("slim") || build.includes("lean")) {
    physique = "slim physique";
  }

  // athletic
  if (build.includes("athletic")) {
    physique = "athletic physique";
  }

  // stocky
  if (build.includes("stocky")) {
    physique = "stocky build";
  }

  // medium enhancement
  if (frame.includes("medium") && (physique === "athletic physique" || physique === "balanced physique")) {
    physique = "compact shoulder frame, short black hair";
  }

  return {
    ...profile,
    buildType: physique,
    bodyFrame: "",
    shoulderWidth: "",
    torsoRatio: "",
    legProportion: "",
    // visualHeight remains to potentially prepend in buildPhysiqueProfile if not average
  };
}

function buildAnatomyAuthority(profile: AnatomyProfile | null, isManual: boolean = false): string {
  if (!profile) return "";

  let base = `ANATOMY AUTHORITY (CRITICAL):
ANATOMY must strictly follow defined parameters: height, weight, body frame, proportions.
No automatic adjustment beyond defined values.
Preserve body proportions from TARGET_SUBJECT and ANATOMY_PROFILE as absolute reference.
Maintain consistent visual height, body frame, shoulder width, torso ratio, and limb proportions.
Prevent scene-based anatomy adaptation or body type hallucination.
Do not inherit body scale, silhouette, or frame from MAIN_SCENE.\n`;

  if (isManual) {
    let details = [];
    if (profile.heightCm) details.push(`* Height: ${profile.heightCm} cm`);
    else if (profile.visualHeight) details.push(`* Height Class: ${profile.visualHeight}`);

    if (profile.buildType) details.push(`* Build Type: ${profile.buildType}`);
    if (profile.bodyFrame) details.push(`* Body Frame: ${profile.bodyFrame}`);
    if (profile.shoulderWidth) details.push(`* Shoulder Width: ${profile.shoulderWidth}`);
    if (profile.torsoRatio) details.push(`* Torso Ratio: ${profile.torsoRatio}`);
    if (profile.legProportion) details.push(`* Leg Proportion: ${profile.legProportion}`);
    if (profile.weightKg) details.push(`* Body Mass/Weight: ${profile.weightKg} kg`);
    if (profile.physicalTraits && profile.physicalTraits.length > 0) details.push(`* Unique Physical Traits: ${profile.physicalTraits.join(", ")}`);

    if (details.length > 0) {
      let detailsStr = details.join("\n");
      detailsStr = normalizeAnatomyTerms(detailsStr);
      detailsStr = dedupeAnatomyDescriptors(detailsStr);
      base += "\n[ CUSTOM ANATOMY - MANUAL OVERRIDE ACTIVE ]\n" + detailsStr + "\n";
    }
  } else {
    // AUTO MODE: HARD LOCK ENFORCEMENT
    const archetype = buildPhysiqueProfile(profile);
    base += `\nANATOMY PROFILE LOCK (AUTO — ENFORCED):\nThis is a STRICT anatomical constraint derived from TARGET_SUBJECT.\n\nPhysique: ${archetype.replace(/\sbuild|physique/gi, "")}\nBody frame: consistent with reference\nHeight class: preserved\nProportion system: locked (no reinterpretation)\n\nENFORCEMENT RULE:\nDo NOT reinterpret, exaggerate, or average body shape.\nDo NOT adapt anatomy to scene context.\nDo NOT generate "idealized" or "generic" body.\n\nAll anatomical output MUST match TARGET_SUBJECT consistency across scenes.\n\nMODE NOTE:\nThis block is AUTO-GENERATED.\nIf manual override is active, this block MUST be replaced by user-defined anatomy values.\n`;
  }

  return base;
}

const resizeImage = (base64Str: string, maxWidth = 512): Promise<string> => {
  return new Promise((resolve) => {
    try {
      console.log(`Resizing image to maxWidth: ${maxWidth}`);
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.warn("Canvas context not available, returning original");
            resolve(base64Str);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const result = canvas.toDataURL('image/jpeg', 0.7);
          console.log(`Resize complete: ${width}x${height}`);
          resolve(result);
        } catch (e) {
          console.error("Canvas resize error:", e);
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        console.error("Image load error for resizing");
        resolve(base64Str);
      };
    } catch (e) {
      console.error("Resize initialization error:", e);
      resolve(base64Str);
    }
  });
};

const getImageAspectRatio = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const ratio = w / h;

      if (ratio > 1.2) {
        if (ratio > 1.5) resolve("16:9");
        else resolve("4:3");
      } else if (ratio < 0.8) {
        if (ratio < 0.6) resolve("9:16");
        else resolve("3:4");
      } else {
        resolve("1:1");
      }
    };
    img.onerror = () => resolve("1:1");
  });
};

const cleanLighting = (text: string) => {
  if (!text || text.trim().length === 0) return "natural daylight with soft directional shadows";

  // 1. HARD FILTER: Remove contamination (angle/shot phrases)
  let cleaned = text.toLowerCase()
    .replace(/\b(angle|shot|low angle|high angle|eye-level|eye level|medium shot|wide shot|close up|full shot)\b/g, "")
    .replace(/\b(man|woman|person|human)\b/g, "subject")
    .replace(/\b(strictly|do not merge|must|enforce|force|strict)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return "natural daylight with soft directional shadows";

  const deduplicateWords = (s: string) => {
    return s.split(',').map(segment => {
      const words = segment.trim().split(/\s+/);
      return words.filter((word, i) => words.indexOf(word) === i).join(" ");
    }).join(", ");
  };
  
  const colors = ["blue", "cyan", "purple", "pink", "warm", "cool", "cold", "neon", "golden", "white", "red", "green", "magenta", "yellow", "orange"];
  
  let detectedColor = "";
  for (const c of colors) {
    if (cleaned.includes(c)) {
      detectedColor = c === "cold" ? "cool" : c;
      break;
    }
  }

  let detectedSource = "";
  if (cleaned.includes("spotlight")) detectedSource = "stage spotlights";
  else if (cleaned.includes("flash")) detectedSource = "camera flash";
  else if (cleaned.includes("natural") || cleaned.includes("daylight")) detectedSource = "natural daylight";
  else if (cleaned.includes("studio")) detectedSource = "studio lighting";
  else if (cleaned.includes("neon")) detectedSource = "neon glow";
  else if (cleaned.includes("sun")) detectedSource = "direct sunlight";
  else if (cleaned.includes("stage")) detectedSource = "stage lighting";
  else if (cleaned.includes("ambient")) detectedSource = "ambient light";
  else if (cleaned.includes("fluorescent")) detectedSource = "fluorescent lighting";
  else if (cleaned.includes("indoor") && cleaned.includes("parking")) detectedSource = "indoor parking lighting";
  else if (cleaned.includes("overhead")) detectedSource = "overhead lighting";

  // Strict Intensity Rules
  let intensity = "diffused";
  if (cleaned.includes("soft") || cleaned.includes("low contrast")) intensity = "soft";
  else if (cleaned.includes("strong") || cleaned.includes("harsh") || cleaned.includes("high contrast")) intensity = "strong";

  // Strict Shadow Rules
  let shadow = "directional shadows";
  if (cleaned.includes("directional")) shadow = "directional shadows";
  else if (cleaned.includes("sharp") || cleaned.includes("hard")) shadow = "sharp shadows";
  else if (cleaned.includes("soft")) shadow = "soft shadows";

  // If we have color or source, use structured builder
  if (detectedColor || detectedSource) {
    const finalColor = detectedColor || "natural";
    const finalSource = detectedSource || "ambient lighting";
    return deduplicateWords(`${finalColor} ${finalSource}, ${intensity} lighting, ${shadow}`);
  }

  // If no keywords but has text, avoid generic fallback
  const descriptiveWords = cleaned.split(" ").filter(w => w.length > 2 && !["lighting", "light", "match", "scene", "illuminated"].includes(w)).slice(0, 3).join(" ");
  if (descriptiveWords.length > 3) {
    return deduplicateWords(`${descriptiveWords} lighting, ${intensity} lighting, ${shadow}`);
  }

  // 3. FALLBACK: If too generic
  return "natural daylight with soft directional shadows";
};

const cleanAngle = (text: string) => {
  if (!text) return "medium shot";
  const lower = text.toLowerCase();
  if (lower.includes("low angle")) return "low angle";
  if (lower.includes("high angle")) return "high angle";
  if (lower.includes("eye level") || lower.includes("eye-level")) return "eye level";
  if (lower.includes("medium shot")) return "medium shot";
  if (lower.includes("wide shot")) return "wide shot";
  if (lower.includes("close up") || lower.includes("closeup")) return "close up";
  if (lower.includes("full shot")) return "full shot";
  return "medium shot";
};

function sanitizeAttributes(input: string): string {
  if (!input) return "";
  return input
    .replace(/\b(man|woman|person|guy|girl|boy|lady)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function injectSubjectAttributes(basePrompt: string, attributes: string): string {
  if (!attributes) return basePrompt;

  // 🔒 STRICT TARGET: full sentence identity (SAMPAI .jpg)
  const pattern = /(with the subject from [^ ]+\.jpg)/i;

  if (pattern.test(basePrompt)) {
    return basePrompt.replace(
      pattern,
      `$1. ${attributes}`
    );
  }

  return basePrompt;
}

function dedupeRealism(text: string): string {
  if (!text) return "";
  const parts = text.split(/,\s*/);
  const seen = new Set<string>();
  const result: string[] = [];
  parts.forEach(p => {
    const low = p.toLowerCase().trim();
    if (low && !seen.has(low)) {
      seen.add(low);
      result.push(p.trim());
    }
  });
  return result.join(", ");
}

function compressLighting(text: string): string {
  return text.replace(/\.(?!\s|$)/g, ". ").replace(/\s\s+/g, " ");
}

function cleanDoubleDots(text: string): string {
  return text.replace(/\.\.+/g, ".");
}

function forceCleanStage2(prompt: string): string {
  return prompt
    // ❌ HAPUS SEMUA LOCK YANG BERBAHAYA
    .replace(/strictly following the skeletal pose in MAIN_SCENE/gi, "")
    .replace(/strictly lock to the base pose structure in MAIN_SCENE/gi, "")
    .replace(/maintain rigid stability in torso, shoulders, and neck/gi, "")

    // ❌ HAPUS VARIASI LAIN YANG SERUPA
    .replace(/rigid stability in torso[^.]*\./gi, "")
    .replace(/strictly lock[^.]*pose[^.]*\./gi, "")

    // ✅ OPTIONAL: rapihin spacing
    .replace(/\s{2,}/g, " ")
}

function enforcePassExecution(prompt: string): string {
  if (prompt.includes("EXECUTION ENFORCEMENT RULE:")) {
    return prompt; // prevent duplicate injection
  }

  // Check if the EXECUTION SYSTEM: header exists before attempting replacement
  if (!prompt.includes("EXECUTION SYSTEM:")) {
    return prompt;
  }

  return prompt.replace(
    "EXECUTION SYSTEM:",
    `EXECUTION SYSTEM:

EXECUTION ENFORCEMENT RULE:
- Execute ALL PASS sequentially (PASS 1 → PASS 5)
- DO NOT skip any PASS
- DO NOT merge PASS
- DO NOT jump directly to output
- Each PASS must be completed before the next begins

If any PASS is skipped or incomplete → RESULT IS INVALID → RESTART FROM PASS 2
`
  );
}

function fixFileSpacing(text: string): string {
  return text.replace(/\.\s+(jpg|png|jpeg)/gi, ".$1");
}

function dedupeExecutionBlock(text: string): string {
  const marker = "EXECUTION ENFORCEMENT RULE:";
  const parts = text.split(marker);
  
  if (parts.length <= 2) return text;

  // Keep first part, marker, and second part (first content of the rule)
  return parts[0] + marker + parts[1];
}

function sanitizeRealismStack(text: string): string {
  if (!text) return "";

  const semanticMap: Record<string, string> = {
    "natural skin texture": "natural skin microtexture with subtle imperfections",
    "natural skin microtexture": "natural skin microtexture with subtle imperfections",
    "soft shadows": "soft shadows with smooth gradient",
    "smooth shadow gradient": "soft shadows with smooth gradient",
    "natural occlusion": "natural occlusion with soft contact shadows",
    "contact shadows": "natural occlusion with soft contact shadows",
    "specular highlights on skin": "specular highlights on skin from directional lighting",
    "realistic lighting": "physically accurate lighting response",
    "physically accurate lighting": "physically accurate lighting response",
  };

  // 1. Identify "Subject Description" vs "Realism Stack"
  let basePrompt = text;
  let realismPart = "";

  const splitIdx = text.search(/Match lighting:|Matching /i);
  if (splitIdx !== -1) {
    basePrompt = text.substring(0, splitIdx);
    realismPart = text.substring(splitIdx);
  } else {
    // Fallback: use the part after the last major instruction sentence
    const firstDot = text.indexOf(".");
    if (firstDot !== -1 && firstDot < text.length - 1) {
      basePrompt = text.substring(0, firstDot + 1);
      realismPart = text.substring(firstDot + 1);
    }
  }

  if (!realismPart) return text;

  // 2. Process stackSection (Rule 1 & 4: split by comma/dot, but preserve filenames)
  let parts = realismPart.split(/\s*,\s*|\.\s*(?!(?:jpg|jpeg|png|webp|gif|bmp|tiff)\b)/gi).map(p => p.trim()).filter(Boolean);
  
  const seen = new Set<string>();
  const stack: string[] = [];

  // Rule 3: Priority loop (reversed to favor later/V5 additions)
  for (let i = parts.length - 1; i >= 0; i--) {
    let part = parts[i];
    let lowPart = part.toLowerCase().replace(/[.,!]$/g, "");

    // Skip residue "Lighting"
    if (lowPart === "lighting") continue;

    // Rule 2: Semantic Merge
    for (const [key, replacement] of Object.entries(semanticMap)) {
      if (lowPart.includes(key)) {
        part = replacement;
        lowPart = replacement.toLowerCase();
        break;
      }
    }

    const isG = ["natural occlusion with soft contact shadows", "feet grounded naturally on surface", "realistic weight distribution", "natural interaction with environment"].includes(lowPart);
    if (isG || !seen.has(lowPart)) {
      if (!isG) seen.add(lowPart);
      stack.unshift(part);
    }
  }

  let l: string[] = [], g: string[] = [], c: string[] = [], r: string[] = [];
  stack.forEach(p => {
    let t = p.trim(); if (t.length < 5 || t.toLowerCase().includes("soft light wrap")) return;
    if (t.toLowerCase().includes("light wrap")) t = "subtle light wrap";
    const low = t.toLowerCase();
    if (l.concat(g, c, r).some(v => v.toLowerCase() === low)) return;
    const isR = /skin|eye|fabric|texture|micro|reflection|physically accurate/i.test(low);
    if (!isR && /light|shadow|ambient|highlight|wrap/i.test(low)) l.push(t);
    else if (/ground|contact|weight|interaction/i.test(low)) g.push(t);
    else if (/depth|lens|background|perspective/i.test(low)) c.push(t);
    else if (r.length < 8 && !/natural light interaction|realistic skin texture/i.test(low)) r.push(t);
  });
  const assembly = [l, g, c, r].map(a => [...new Set(a)].join(", ")).filter(Boolean).join(", ");
  let final = basePrompt.trim();
  if (assembly) final += (final.endsWith(".") || final.endsWith(",") ? " " : ", ") + assembly.trim();
  
  return final
    .replace(/,\s*,/g, ",")
    .replace(/\.\./g, ".")
    .replace(/Lighting, lighting/gi, "Lighting")
    .replace(/\s+/g, " ")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ".")
    .trim();
}

function fixAttributePunctuation(text: string): string {
  return text.replace(
    /(Subject attributes:[^\.]+)\.,/i,
    "$1."
  );
}

function cleanSubjectWord(text: string): string {
  return text.replace(
    /Maintain the original subject /gi,
    "Maintain the original "
  );
}

function fixSentenceCapitalization(text: string): string {
  return text.replace(
    /\. ([a-z])/g,
    (_, char) => `. ${char.toUpperCase()}`
  );
}

function normalizeLightingV3(text: string): string {
  // STEP 1: ambil semua lighting phrases
  let lightingMatch = text.match(/matching (.*?)(?:,| with)/i);
  if (!lightingMatch) return text;

  let raw = lightingMatch[1];

  // STEP 2: split jadi bagian kecil
  let parts = raw
    .split(/,|and|with/gi)
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);

  // STEP 3: classify
  let base: string[] = [];
  let modifiers: string[] = [];

  parts.forEach(p => {
    if (/lighting|light|glow|backlight|spotlight|neon/i.test(p)) {
      base.push(p);
    } else {
      modifiers.push(p);
    }
  });

  // STEP 4: remove duplicate
  base = [...new Set(base)];
  modifiers = [...new Set(modifiers)];

  // STEP 5: rebuild clean
  let result = "";

  if (base.length > 0) {
    result = base.join(" ");
  }

  if (modifiers.length > 0) {
    result += " with " + modifiers.join(", ");
  }

  // STEP 6: final cleanup
  result = result
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();

  // STEP 7: inject back
  return text.replace(/matching (.*?)(?=, directional shadows)/i, `matching ${result}`);
}

function compressRealism(text: string): string {
  return text
    // lighting realism (from V1)
    .replace(
      /realistic skin texture, natural light interaction, accurate shadow softness, physically correct lighting response/gi,
      "physically accurate lighting and realistic skin response"
    )

    // shadow + occlusion (V2 optimized)
    .replace(
      /natural occlusion, subtle contact shadows/gi,
      "natural occlusion with soft contact shadows"
    )

    // fabric + integration
    .replace(
      /detailed fabric texture, seamless subject integration/gi,
      "detailed fabric texture with seamless integration"
    )

    // final merge (if still chained)
    .replace(
      /with soft contact shadows, seamless subject integration/gi,
      "with soft contact shadows and seamless integration"
    )

    // cleanup duplicate
    .replace(/\b(realistic skin texture),.*\1/gi, "$1");
}

function polishRealismPhrase(text: string): string {
  return text
    .replace(
      /natural occlusion with soft contact shadows and seamless integration/gi,
      "natural occlusion with soft contact shadows and seamless blending"
    );
}

function applyCameraDepth(text: string, angle?: string, env?: string): string {
  let depth = "";
  let lens = "";

  // ===============================
  // DEPTH OF FIELD LOGIC
  // ===============================

  if (/close|portrait|face/i.test(angle || "")) {
    depth = "shallow depth of field with soft background blur";
    lens = "portrait lens compression";
  } else if (/wide|full|environment/i.test(angle || "")) {
    depth = "deep depth of field with clear background detail";
    lens = "wide angle lens perspective";
  } else {
    depth = "moderate depth of field with natural background separation";
    lens = "natural lens perspective";
  }

  // ===============================
  // ENVIRONMENT BOOST
  // ===============================

  if (/indoor|room|bar|cafe|studio/i.test(env || "")) {
    depth += ", subtle background falloff";
  }

  if (/outdoor|beach|street|nature/i.test(env || "")) {
    depth += ", atmospheric depth and distance haze";
  }

  // ===============================
  // INJECTION
  // ===============================

  return text.replace(
    /(accurate shadow direction and depth\.)/i,
    `$1 ${depth}, ${lens},`
  );
}

function fixCommaSpacing(text: string): string {
  return text
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/([a-z])([A-Z])/g, "$1, $2"); // missing comma before capital
}

function applyMicroDetails(text: string, env?: string): string {
  let microDetails: string[] = [];

  // ===============================
  // SKIN DETAIL
  // ===============================
  microDetails.push("natural skin microtexture with subtle imperfections");

  // ===============================
  // EYE DETAIL
  // ===============================
  microDetails.push("subtle eye reflection with natural catchlight");

  // ===============================
  // FABRIC DETAIL
  // ===============================
  microDetails.push("fabric micro folds following body movement");

  // ===============================
  // CONDITIONAL (ENV BASED)
  // ===============================

  if (/outdoor|beach|sun|tropical/i.test(env || "")) {
    microDetails.push("subtle skin sheen from natural light");
  }

  if (/club|night|bar|neon|stage/i.test(env || "")) {
    microDetails.push("specular highlights on skin from directional lighting");
  }

  // ===============================
  // LIMITER (ANTI OVERLOAD)
  // ===============================

  microDetails = microDetails.slice(0, 4);

  // ===============================
  // INJECTION
  // ===============================

  return text.replace(
    /(seamless blending)(\.?)/i,
    (match, base, dot) => {
      return `${base}.${" "}${microDetails.join(", ")}`;
    }
  );
}

function fixMissingDotBeforeMicro(text: string): string {
  return text.replace(
    /(seamless blending)(\s+)(natural skin microtexture)/gi,
    "seamless blending. natural skin microtexture"
  );
}

function fixPunctuationFlow(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .trim();
}

// ==================================================
// ⚙️ PATCH — FILE TOKEN SANITIZER V6 (LOCK + RESTORE SYSTEM)
// ==================================================

// ==================================================
// 🛡️ [FILE TOKEN INTEGRITY GUARD V1]
// ==================================================

function validateAndCleanFilename(name: string): string {
  if (!name) return "";
  
  let cleaned = name.trim();
  
  // 1. Remove duplicated prefixes (e.g., photo_photo_, asset_asset_)
  cleaned = cleaned.replace(/^(photo_|asset_)\1+/gi, "$1");
  cleaned = cleaned.replace(/^(photo_asset_|asset_photo_)/gi, "photo_");

  // 2. Ensure extension integrity
  const hasValidExt = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|avif)$/i.test(cleaned);
  if (!hasValidExt) {
    console.warn(`[INTEGRITY GUARD] Missing extension in: ${cleaned}`);
  }

  // 3. Check for truncation (ends with dot but no extension)
  if (cleaned.endsWith(".") && !hasValidExt) {
    console.error(`[INTEGRITY GUARD] Detected truncated filename: ${cleaned}`);
  }

  // 4. Remove internal spaces as per V1 rules
  cleaned = cleaned.replace(/\s+/g, "_");

  return cleaned;
}

function lockFileTokens(text: string): { locked: string; files: { key: string; value: string }[] } {
  const files: { key: string; value: string }[] = [];
  let index = 0;

  // STEP 1: Aggressive Lock Regex (No boundaries to prevent issues with symbols like =)
  const locked = text.replace(/[\w\-\.\(\)\[\]\@\#]+\.(jpg|jpeg|png|webp|gif|bmp|tiff)\b/gi, (match) => {
    if (match.includes("__FILE_")) return match;
    const key = `__FILE_${index}__`;
    files.push({ key, value: validateAndCleanFilename(match) });
    index++;
    return key;
  });

  return { locked, files };
}

function detectBrokenToken(text: string): boolean {
  if (!text.includes("__FILE_")) return false;
  // Look for corrupted fragments like ends with dot or missing body before extension
  const brokenPattern = /\b(?![A-Z_]+_\d+__)([\w\-]*)\.(jpg|jpeg|png|webp|gif|bmp|tiff)\b/i;
  const match = text.match(brokenPattern);
  if (match && !match[1]) return true; // Just ".jpg" is broken
  return /[a-zA-Z]\.(jpg|jpeg|png|webp|gif|bmp|tiff)\b/i.test(text);
}

function repairBrokenFileTokens(text: string): string {
  return text.replace(
    /\b([\w-]+),\s*(jpg|jpeg|png|webp|gif|bmp|tiff)\b/gi,
    "$1.$2"
  );
}

function cleanBrokenExtensions(text: string): string {
  // Fix double extensions or dots before extension instead of stripping valid ones
  return text.replace(/\.\.(jpg|jpeg|png|webp|gif|bmp|tiff)\b/gi, ".$1");
}

function cleanSentence(text: string): string {
  return text
    .replace(/[^\S\r\n]{2,}/g, " ") // Collapse horizontal spaces only
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
}

function restoreFileTokens(text: string, files: { key: string; value: string }[]): string {
  let restored = text;
  files.forEach(f => {
    restored = restored.replace(f.key, f.value);
  });
  return restored;
}

function sanitizeFinalOutput(text: string): string {
  if (!text) return "";

  // 1. LOCK ATOMIC FILENAMES (BYPASS SYSTEM)
  const { locked, files } = lockFileTokens(text);

  let cleaned = locked;

  // 2. DOCUMENT LAYOUT PRESERVATION (PATCH V5.2 - CRITICAL READABILITY FIX)
  // Disable aggressive whitespace compression that removes paragraph spacing
  cleaned = cleaned
    .replace(/[^\S\r\n]{2,}/g, " ")       // Collapse horizontal spaces only
    .replace(/\s+\n/g, "\n")              // Trim trailing spaces before newline
    .replace(/\n\s+/g, "\n")              // Trim leading spaces after newline
    .replace(/\n{3,}/g, "\n\n");          // Maintain max one blank line between blocks

  // 3. ENFORCE HEADING & SECTION READABILITY
  // Every heading must be followed by a blank line before content
  cleaned = cleaned.replace(/^(#+\s+.*)$/gm, "$1\n");
  
  // Every separator-style heading (━━━━━━━━━━━━━━━━) must be followed by a blank line
  cleaned = cleaned.replace(/^(━+.*━+)$/gm, "$1\n");

  // Every subsection (###) preceded by blank line if not at start
  cleaned = cleaned.replace(/([^\n])\n*(###+\s+)/g, "$1\n\n$2");

  // Every list item (bullet or numbered) must be on its own line
  cleaned = cleaned.replace(/([^\n])(\n*\s*([\*\-\+]|(\d+\.))\s+)/g, "$1\n$2");

  // Double check all headers and clear delimiters have a forced blank line after them
  cleaned = cleaned.replace(/([^\n])\n*(━━━━━━━━━━━━━━━━)/g, "$1\n\n$2");
  cleaned = cleaned.replace(/(━━━━━━━━━━━━━━━━)\n*([^\n])/g, "$1\n\n$2");

  // Collapse any redundant newlines from insertions to maintain exactly one blank line max
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 4. MINIMAL PUNCTUATION CLEANING (Only non-filename text)
  cleaned = cleaned
    .replace(/[ ]+,/g, ",")
    .replace(/[ ]+\./g, ".");

  // 5. RE-INJECT ORIGINAL FILENAMES (STRICT PRESERVATION)
  cleaned = restoreFileTokens(cleaned, files);

  // 6. FINAL VALIDATION (CRITICAL): Ensure files are exactly as in input Source
  return cleaned.trim();
}

// ==================================================
// ⚙️ PATCH — AUTO LIGHTING DETECTOR V2 (OUTDOOR FIX)
// ==================================================

function detectSceneLighting(envText = "", lightingText = "") {
  const text = (envText + " " + lightingText).toLowerCase();

  // 🔥 DAYLIGHT VARIATION (PRIORITY)
  if (text.includes("sunset") || text.includes("evening") || text.includes("golden")) {
    return "warm golden hour sunlight, long soft shadows, warm highlights on skin, smooth light falloff";
  }

  if (text.includes("noon") || text.includes("midday")) {
    return "harsh overhead sunlight, short defined shadows, high contrast lighting";
  }

  // GENERAL OUTDOOR
  if (text.includes("outdoor") || text.includes("daylight") || text.includes("sun") || 
      text.includes("forest") || text.includes("jungle") || text.includes("beach") || 
      text.includes("ocean") || text.includes("lake") || text.includes("river") || 
      text.includes("mountain") || text.includes("garden") || text.includes("park") || 
      text.includes("patio") || text.includes("terrace")) {
    return "natural daylight, directional sunlight, defined shadows with realistic falloff, subtle skin highlights from sun exposure";
  }

  if (text.includes("neon") || text.includes("club") || text.includes("night")) {
    return "neon ambient lighting with volumetric edge glow, directional magenta spill, cyan light reflections, and soft diffused shadows with complex color spill on skin and material surfaces";
  }

  if (text.includes("stage") || text.includes("concert") || text.includes("spotlight")) {
    return "strong directional spotlight, high contrast shadows, specular highlights on skin";
  }

  if (text.includes("lounge") || text.includes("bar") || text.includes("warm")) {
    return "warm ambient lighting, soft shadows, subtle light wrap";
  }

  if (text.includes("indoor") || text.includes("room") || text.includes("studio") || 
      text.includes("office") || text.includes("hallway") || text.includes("kitchen") || 
      text.includes("bedroom") || text.includes("lounge")) {
    return "soft diffused indoor lighting, natural shadow falloff";
  }

  return "neutral ambient lighting, soft shadows";
}

function removeDuplicateLighting(text: string) {
  return text.replace(/lighting[^,]*,?/gi, "").trim();
}

// ==================================================

// ===============================
// AUTO SUBJECT ATTRIBUTES ENGINE
// ===============================

function inferSubjectAttributes(
  pose: string,
  env: string,
  lighting: string,
  skinTone?: string
): {
  age: string;
  height: string;
  build: string;
  weight: string;
  skin: string;
} {
  let age = "Indonesian Southeast Asian male";
  let height = "medium brown warm skin tone";
  let build = "compact shoulder frame, short black hair";
  let weight = "";
  let skin = skinTone || "indonesian skin tone";

  const context = `${pose} ${env} ${lighting}`.toLowerCase();

  // AGE REFINEMENT — SPECIFIC CATEGORIES
  if (context.includes("executive") || context.includes("corporate") || context.includes("formal") || context.includes("gala") || context.includes("sophisticated")) {
    age = "Early Thirties";
  } else if (context.includes("office") || context.includes("urban") || context.includes("professional") || context.includes("working") || context.includes("business")) {
    age = "Late Twenties";
  } else if (context.includes("streetwear") || context.includes("campus") || context.includes("college") || context.includes("university") || context.includes("student")) {
    age = "Early Twenties";
  } else if (context.includes("street") || context.includes("casual")) {
    age = "young adult";
  }

  // BUILD & WEIGHT LOGIC
  if (context.includes("gym") || context.includes("athletic") || context.includes("performance") || context.includes("workout")) {
    build = "athletic";
    weight = "solid and well-built";
  } else if (context.includes("beach") || context.includes("pool") || context.includes("resort") || context.includes("fashion") || context.includes("runway")) {
    build = "fit";
    weight = "lean and lightweight";
  } else {
    build = "average build";
    weight = "balanced and proportional";
  }

  // ANGLE / HEIGHT PERCEPTION
  if (context.includes("low angle")) {
    height = "tall";
  }

  if (context.includes("high angle")) {
    height = "average height";
  }

  return { age, height, build, weight, skin };
}

function stabilizePromptText(text: string): string {
  return text
    // remove duplicated perspective
    .replace(/\bperspective\.\s*perspective\b/gi, "perspective")

    // repair truncated low/high phrases
    .replace(/\bslightly lo\.\b/gi, "slightly low perspective")
    .replace(/\bslightly hi\.\b/gi, "slightly high perspective")

    // remove double spaces
    .replace(/\s{2,}/g, " ")

    // clean spacing before punctuation
    .replace(/\s+([.,])/g, "$1")

    .trim();
}

function dedupeAnatomyDescriptors(text: string): string {
  if (!text) return text;

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/,\s+/g, ", ")
    .trim();

  const parts = normalized
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();

  const cleaned = parts.filter(part => {
    const key = part.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  return cleaned.join(", ");
}

function normalizeAnatomyTerms(text: string): string {
  if (!text) return text;
  
  let normalized = text
    .replace(/\bbalanced shoulders\b/gi, "medium shoulders")
    .replace(/\bbalanced torso\b/gi, "proportional torso")
    .replace(/\bbalanced leg proportion\b/gi, "proportional leg length")
    .replace(/\blean medium frame\b/gi, "lean athletic frame")
    .replace(/\bmedium frame\b/gi, "medium body frame");

  // PART 3: Generic Descriptor Filter
  // Only keep "proportional" or "medium" if they are the ONLY descriptor in a list, 
  // or part of a multi-word phrase we just normalized.
  // We'll do a simple filter for comma separated lists if needed, 
  // but for raw text we target specific weak words.
  
  return normalized;
}

function buildAutoSubjectAttributes(
  pose: string,
  env: string,
  lighting: string,
  poseMode: PoseMode,
  skinTone?: string,
  manualAnatomy?: AnatomyProfile | null,
  identityTraits?: { face_shape?: string; hair?: string; expression?: string }
): string {
  if (!pose || !env || !lighting) return "";

  let { age, height, build, weight, skin } = inferSubjectAttributes(pose, env, lighting, skinTone);

  const extraIdentity: string[] = [];
  if (identityTraits?.face_shape && identityTraits.face_shape.trim() && !/not clearly/i.test(identityTraits.face_shape)) {
    extraIdentity.push(`${identityTraits.face_shape.trim()} face`);
  }
  if (identityTraits?.hair && identityTraits.hair.trim() && !/not clearly/i.test(identityTraits.hair)) {
    extraIdentity.push(`${identityTraits.hair.trim()}`);
  }
  if (identityTraits?.expression && identityTraits.expression.trim() && !/not clearly/i.test(identityTraits.expression)) {
    extraIdentity.push(`${identityTraits.expression.trim()} expression`);
  }

  // ANATOMY INJECTION
  const isManual = !!manualAnatomy;
  let profile = manualAnatomy || inferAnatomyProfile(`${height}, ${build}`);
  
  // APPLY AUTO NORMALIZATION
  if (!isManual) {
    profile = normalizeAutoAnatomyProfile(profile);
  }
  
  let anatomyStr = "";
  if (isManual) {
    const anatomyParts = [];
    if (profile.visualHeight) anatomyParts.push(`${profile.visualHeight} height`);
    if (profile.buildType) anatomyParts.push(`${profile.buildType}`);
    if (profile.shoulderWidth) anatomyParts.push(`${profile.shoulderWidth}`);
    if (profile.torsoRatio && profile.torsoRatio !== "proportional torso" && profile.torsoRatio !== "balanced torso") {
      anatomyParts.push(`${profile.torsoRatio}`);
    }
    if (profile.legProportion && profile.legProportion !== "proportional leg length" && profile.legProportion !== "balanced leg proportion") {
      anatomyParts.push(`${profile.legProportion}`);
    }
    anatomyStr = anatomyParts.length > 0 ? `, ${anatomyParts.join(", ")}` : "";
    
    // Clear generic auto-inferred height/build/weight to prevent conflicts in Manual mode
    height = "";
    build = "";
    weight = "";
  } else {
    // AUTO MODE: Use ONE humanized archetype
    anatomyStr = `, ${buildPhysiqueProfile(profile)}`;
    
    // Dedupe front parameters
    const combinedAnatomy = anatomyStr.toLowerCase();
    if (combinedAnatomy.includes("height")) { height = ""; }
    if (combinedAnatomy.includes("build") || combinedAnatomy.includes("physique") || combinedAnatomy.includes("frame")) { build = ""; }
  }

  const parts = [age, height, build, weight, ...extraIdentity, anatomyStr.replace(/^,\s*/, ""), skin].filter(p => p && p.trim().length > 0);
  let resultStr = parts.join(", ").replace(/,\s*,/g, ",");

  // PATCH: Normalize and Dedupe
  resultStr = normalizeAnatomyTerms(resultStr);
  resultStr = dedupeAnatomyDescriptors(resultStr);

  // FINAL FILTER: Remove low-value generic terms if they are redundant
  if (resultStr.includes(",") && (resultStr.includes("average") || resultStr.includes("medium body frame"))) {
    resultStr = resultStr.split(", ")
      .filter(p => !(/^(average|medium body frame)$/i.test(p)))
      .join(", ");
  }

  // FREE MODE VARIATION TAG
  if (poseMode === "FREE") {
    return `${resultStr}, natural variation allowed.`;
  }

  return `${resultStr}.`.replace(/\.\./g, ".");
}

function applyAutoAttributes(
  basePrompt: string,
  pose: string,
  env: string,
  lighting: string,
  poseMode: PoseMode,
  skinTone?: string
): string {
  const rawAttributes = buildAutoSubjectAttributes(pose, env, lighting, poseMode, skinTone);

  if (!rawAttributes) return basePrompt;

  const safeAttributes = sanitizeAttributes(rawAttributes);

  return injectSubjectAttributes(basePrompt, safeAttributes);
}

// ===============================
// REALISM BOOST V3 — PHYSICS AWARE
// ===============================

function buildRealismEnhancer(
  lighting: string,
  env: string
): string {
  let realism = [
    "realistic skin texture",
    "natural light interaction",
    "accurate shadow softness",
    "physically correct lighting response",
    "physically accurate subsurface scattering",
    "realistic skin sheen",
    "detailed fabric texture",
    "natural occlusion",
    "subtle contact shadows",
    "seamless subject integration"
  ];

  const context = `${lighting} ${env}`.toLowerCase();

  // LIGHT-SPECIFIC BOOST
  if (context.includes("strong") || context.includes("spotlight")) {
    realism.push("high contrast light falloff", "specular highlights on skin");
  }

  if (context.includes("soft") || context.includes("diffused")) {
    realism.push("soft light wrap", "smooth shadow gradient");
  }

  if (context.includes("blue") || context.includes("neon")) {
    realism.push("color spill on skin and clothing", "light color reflection accuracy");
  }

  return realism.join(", ");
}

function injectRealismEnhancer(
  basePrompt: string,
  lighting: string,
  env: string
): string {
  const realism = buildRealismEnhancer(lighting, env);

  if (!realism) return basePrompt;

  // 🔥 TARGET: setelah "Match lighting:"
  const pattern = /(Match lighting:[^\.]+)/i;

  if (pattern.test(basePrompt)) {
    return basePrompt.replace(
      pattern,
      `$1, ${realism}`
    );
  }

  // fallback
  return `${basePrompt} ${realism}`;
}

function applyRealismV3(
  basePrompt: string,
  lighting: string,
  env: string
): string {
  return injectRealismEnhancer(basePrompt, lighting, env);
}

function applyGroundingV1(prompt: string): string {
  if (prompt.includes("feet grounded naturally") || prompt.includes("realistic weight distribution")) return prompt;
  const set = "feet grounded naturally on surface, realistic weight distribution, natural interaction with environment";
  const anchor = "natural occlusion with soft contact shadows";
  if (prompt.includes(anchor)) return prompt.replace(anchor, `${anchor}, ${set}`);
  if (prompt.includes("natural occlusion")) return prompt.replace("natural occlusion", `natural occlusion with soft contact shadows, ${set}`);
  const fallback = "with accurate shadow direction and depth";
  if (prompt.includes(fallback)) return prompt.replace(fallback, `${fallback}, ${set}`);
  return prompt;
}

function normalizeGroundingStack(p: string): string {
  return p.replace(/natural occlusion(?! with soft contact shadows)/gi, "natural occlusion with soft contact shadows");
}

// 🔒 [STABLE ZONE: NANO BANANA ENGINE V1.0 - DO NOT MODIFY]
// ANY CHANGES TO THIS BLOCK MUST BE EXPLICITLY REQUESTED AND AUDITED.
const NANO_BANANA_CONFIG = {
  INSTRUCTIONS: `Analyze the images and return technical components for prompt construction.
        NANO MODE RULES:
        - lighting_type: Technical lighting type ONLY, NO color (e.g. 'front flash', 'directional studio light').
        - color_tones: Detected color tones ONLY, always ending with 'color tones' (e.g. 'cyan and magenta color tones').
        - pose: Humanized description (e.g. 'standing with a hand gesture', 'standing with raised hand').
        - environment: COMPACT technical form ONLY. NO narrative. 
          - FORBIDDEN: "The subject is sitting on", "what appears to be".
          - FORMAT: "[location type] with [main object] and [theme] theme".
        - negative: Standard negative prompt for subject replacement.
        - NO narrative or descriptive sentence construction. Return ONLY the requested components.`,
  PROMPT_RULES: `
        NANO BANANA RULES:
        - ADD LANGUAGE: "Use subject appearance from REFERENCE_IMAGE. Apply clothing from OUTFIT_IMAGE."
        - POSE: Use natural phrasing like "standing with a hand gesture" instead of "hand gesture pose".
        `
};

const LIGHT_INTEGRATION_BLOCK = (mode: string = 'daylight') => {
  const modes: any = {
    neon: "Match lighting: strong color spill, soft shadow",
    studio: "Match lighting: sharp shadow, high contrast",
    daylight: "Match lighting: natural soft shadow, balanced exposure"
  };
  return modes[mode] || modes.daylight;
};

const EDGE_BLEND_BLOCK = `Edges:
- No cutout look
- Slight edge blur based on depth of field
- Subtle color blending with background`;

const CONTACT_PHYSICS_BLOCK = `Shadows:
- Add realistic contact shadow under subject
- Match shadow direction and softness`;

const PERSPECTIVE_BLOCK = `Perspective:
- Match camera angle and scale
- Align feet/body with ground`;

const TRANSFORM_INTENT_BLOCK = `TASK: Replace the person in BASE_IMAGE with TARGET_SUBJECT`;

const CORE_ACTION_BLOCK = (main: string, subject: string, outfit: string) => `CORE ACTION:

Remove the original person from BASE_IMAGE.
Insert a new person using the identity from [TARGET_SUBJECT: ${subject}].
${outfit ? `Apply clothing from [OUTFIT_REFERENCE: ${outfit}].` : `Preserve original clothing structure from [BASE_IMAGE: ${main}].`}`;

const HARD_CONSTRAINTS_BLOCK = `HARD CONSTRAINTS:

- The original person must be completely removed
- The final person must match ONLY TARGET_SUBJECT
- No blending of identities
- No original face, body, or clothing should remain
- Do not return the original image`;

const POSE_ENGINE_BLOCK = (mode: string = 'lock') => `POSE:

${mode === 'lock' 
  ? 'Follow the pose from BASE_IMAGE strictly.' 
  : 'Follow the pose from BASE_IMAGE. Allow natural variation.'}`;

const OUTPUT_GOAL_BLOCK = `OUTPUT:

A fully transformed image where the person in BASE_IMAGE is replaced by TARGET_SUBJECT with natural and seamless integration.`;

const OCCLUSION_RESTORATION_BLOCK = ``; // Simplified to zero to prevent redundancy as per user request

const NANO_BANANA_ENGINE = {
  process: async (data: any, context: {
    mainFileName: string;
    replacementFileName: string;
    outfitImage: string | null;
    outfitFileName: string;
    poseMode: PoseMode;
    envPreset: EnvPreset;
    atmosPreset: AtmosPreset;
    sanitize: (t: string) => string;
    anatomyProfile: AnatomyProfile | null;
    outputMode: OutputMode;
    replacementDetection: DetectionResult | null;
    cleanedScene: string;
    isMultiSubject: boolean;
    targetSubjectRole: string;
    coverageOverride?: CoverageOverride;
    chatTrigger?: string;
  }, options?: { coverageOverride?: CoverageOverride }) => {
    const { mainFileName, replacementFileName, outfitImage, outfitFileName, poseMode: inputPoseMode, envPreset: inputEnvPreset, atmosPreset: inputAtmosPreset, sanitize, anatomyProfile, outputMode, replacementDetection, cleanedScene, isMultiSubject, targetSubjectRole, coverageOverride: contextCoverageOverride, chatTrigger } = context;
    
    // --- START OF STABLE LOGIC (EXACT COPY) ---
    const { lighting_type, color_tones, pose, outfit, negative, skin_tone, expression, face_shape, hair } = data.prompts || {};

    const cleanIdentityTrait = (val?: string) => (val && typeof val === 'string' && val.trim() && !/not clearly/i.test(val)) ? val.trim() : "";
    const cleanExpression = cleanIdentityTrait(expression);
    const cleanFaceShape = cleanIdentityTrait(face_shape);
    const cleanHair = cleanIdentityTrait(hair);
    const nanoTrigger = formatChatTriggerForEngine(chatTrigger || "", 'nano');

    // --- ADAPTIVE PRESET INTELLIGENCE V1.0 ---
    const detectAutoPresets = (): { primary: EnvPreset; secondary: AtmosPreset } => {
      const sceneEnv = (data.analysis?.environment || "").toLowerCase();
      const sceneLighting = (data.analysis?.lighting || "").toLowerCase();

      // Signal Detection
      const isDaylight = sceneLighting.includes("sunlight") || sceneLighting.includes("daylight") || sceneEnv.includes("outdoor sunlight");
      const isLowLight = sceneLighting.includes("low light") || sceneLighting.includes("dim") || sceneLighting.includes("night") || sceneLighting.includes("dark");
      const isMixed = sceneLighting.includes("mixed") || sceneLighting.includes("neon") || (isLowLight && sceneEnv.includes("club"));

      const isIndoor = sceneEnv.includes("indoor") || sceneEnv.includes("club") || sceneEnv.includes("room") || sceneEnv.includes("studio");
      const isOutdoor = sceneEnv.includes("outdoor") || sceneEnv.includes("street") || sceneEnv.includes("city") || sceneEnv.includes("urban");
      const isUrban = sceneEnv.includes("urban") || sceneEnv.includes("street") || sceneEnv.includes("alley") || sceneEnv.includes("signage");

      const hasFog = sceneEnv.includes("fog") || sceneEnv.includes("haze") || sceneEnv.includes("mist");
      const hasRain = sceneEnv.includes("rain") || sceneEnv.includes("wet") || sceneEnv.includes("water reflection");

      let primary: EnvPreset = "DAYLIGHT";
      let secondary: AtmosPreset = "NONE";

      // Selection Logic
      if (isDaylight && isOutdoor) {
        primary = "DAYLIGHT";
        if (sceneLighting.includes("backlit") || sceneLighting.includes("sunset")) secondary = "BACKLIGHT";
      } else if (isLowLight && isIndoor) {
        primary = "CLUB";
        if (hasFog) secondary = "FOG";
      } else if (isUrban && isLowLight) {
        primary = "STREET";
        if (hasRain) secondary = "RAIN";
      } else if (isMixed) {
        primary = "CLUB";
        secondary = "FOG";
      } else if (isOutdoor) {
        primary = "STREET";
      }

      return { 
        primary: (inputEnvPreset && inputEnvPreset !== "AUTO") ? inputEnvPreset : primary,
        secondary: (inputAtmosPreset && inputAtmosPreset !== "AUTO") ? inputAtmosPreset : secondary
      };
    };

    const { primary: envPreset, secondary: atmosPreset } = detectAutoPresets();

    // --- POSE_CONTROL_ENGINE — AUTO MODE SWITCH V1.0 (PRECISION SAFE) ---
    const detectAutoPoseMode = (): PoseMode => {
      // 1. SIGNAL ANALYSIS
      const targetPose = (pose || "").toLowerCase();
      const sceneEnv = (data.analysis?.environment || "").toLowerCase();
      const sceneLighting = (data.analysis?.lighting || "").toLowerCase();
      
      // POSE_COMPLEXITY
      const isComplexityComplex = targetPose.includes("dynamic") || targetPose.includes("asymmetry") || 
                                  targetPose.includes("limb extension") || targetPose.includes("running") ||
                                  targetPose.includes("jumping") || targetPose.includes("crossed legs");
      
      // SCENE_CONSTRAINT
      const isExtremePerspective = sceneEnv.includes("low angle") || sceneEnv.includes("top-down") || 
                                   sceneEnv.includes("wide lens") || sceneEnv.includes("extreme perspective") ||
                                   sceneEnv.includes("fish eye");
      const isMediumPerspective = sceneEnv.includes("perspective") || sceneEnv.includes("angle") || sceneEnv.includes("depth");
      
      // POSE_ALIGNMENT (Simplified)
      // We check if the target pose keywords are found in the scene description to determine "MATCH"
      const commonKeywords = ["standing", "sitting", "leaning", "portrait"];
      const targetKeywords = commonKeywords.filter(k => targetPose.includes(k));
      const sceneKeywords = commonKeywords.filter(k => sceneEnv.includes(k) || sceneLighting.includes(k));
      
      const isMatch = targetKeywords.length > 0 && targetKeywords.some(k => sceneKeywords.includes(k));
      const isConflict = targetKeywords.length > 0 && sceneKeywords.length > 0 && !isMatch;

      // 2. DECISION LOGIC (Pillar-Based)
      if (inputPoseMode && inputPoseMode !== "AUTO") return inputPoseMode; // USE manual mode if exists (and not AUTO)

      if (isExtremePerspective) return "LOCKED";   // SCENE_CONSTRAINT = HIGH
      if (isConflict) return "FREE";               // POSE_ALIGNMENT = CONFLICT
      if (isComplexityComplex) return "FREE";      // POSE_COMPLEXITY = COMPLEX
      if (isMatch) return "BLEND";                 // POSE_ALIGNMENT = MATCH
      
      return "BLEND"; // Default
    };

    const poseMode: PoseMode = detectAutoPoseMode();

    const cleanPose = (p?: string) => {
      if (!p) return "";
      let cleaned = p
        .toLowerCase()
        .replace(/\./g, " ")
        .replace(/\b(man|woman|person|human)\b/g, "subject")
        .replace(/\s+/g, " ")
        .trim();

      // STEP 3: Normalization Rules
      cleaned = cleaned
        .replace(/\bsitting relaxed\b/g, "sitting in a relaxed position")
        .replace(/\bstanding relaxed\b/g, "standing in a relaxed position")
        .replace(/\bwhile holding\b/g, ", holding");

      // Humanize generic phrases if they are standalone
      if (cleaned === "standing" || cleaned === "hand gesture") {
        cleaned = "standing with a hand gesture";
      }

      return cleaned;
    };

    const buildPoseSentence = (p: string) => {
      if (!p || p === "pose") {
        return "Maintain the original pose";
      }
      // STEP 2: Template Lock - ONLY add "pose" here
      return `Maintain the original ${p} pose`;
    };

    const cleanDots = (text: string) => {
      return text
        .replace(/\.\.+/g, ".")
        .replace(/\s+\./g, ".")
        // Only add space after dot if NOT followed by common image extensions
        .replace(/\.(?!(jpg|jpeg|png|webp|gif|bmp|tiff)\b)\s*/gi, ". ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const formatSentence = (sentence: string) => {
      let clean = sentence
        .replace(/\b(man|woman|person|human)\b/gi, "subject")
        .replace(/\b(strictly|do not merge|must|enforce|force|strict)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!clean) return "";
      // Remove dangling fragments
      if (clean.endsWith(" with strong") || clean.endsWith(" with") || clean.endsWith(" and")) {
         clean = clean.replace(/\s+(with strong|with|and)$/i, "");
      }
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    };

    const removeDuplicateWords = (s: string) => {
      return s.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
    };

    const cleanTextArtifacts = (text: string): string => {
      return text
        .replace(/\.\./g, ".")
        .replace(/\b(\w+)\s+\1\b/gi, "$1") // remove duplicate word
        .replace(/\s+,/g, ",")
        .replace(/\s+\./g, ".")
        .replace(/\s{2,}/g, " ")
        .trim();
    };

    const removeDuplicatePhrases = (text: string): string => {
      return text.replace(
        /\b(.{10,}?)\b(?:\s+\1\b)+/gi,
        "$1"
      );
    };

    const fixArticlesAdvanced = (text: string): string => {
      return text.replace(/\b(a|an)\s+([a-zA-Z]+)/gi, (match, article, word) => {
        const first = word.charAt(0).toLowerCase();
        const correct = "aeiou".includes(first) ? "an" : "a";
        return `${correct} ${word}`;
      });
    };

    const removeDuplicateFragments = (text: string): string => {
      return text.replace(/\b(\w+(?:\s+\w+){0,5})\s+\1\b/gi, "$1");
    };

    const cleanSubjectDuplication = (text: string): string => {
      return text.replace(/subject\s+subject/gi, "subject");
    };

    const addRealismMicroDetails = (text: string): string => {
      let result = text;

      // ------------------------------
      // CONTACT REALISM (SAFE APPEND)
      // ------------------------------
      result = result.replace(
        /(sitting on .*?)(\.)/i,
        (_, match) =>
          `${match}, with natural weight distribution and subtle surface compression.`
      );

      // ------------------------------
      // FABRIC BEHAVIOR (SAFE APPEND)
      // ------------------------------
      result = result.replace(
        /(wearing .*? outfit.*?)(\.)/i,
        (_, match) =>
          `${match}, with natural fabric folds and tension at contact areas.`
      );

      // ------------------------------
      // LIGHTING (STRICT POSITION LOCK)
      // ------------------------------
      result = result.replace(
        /(The scene is illuminated by .*?lighting)/i,
        (match) =>
          `${match}, with realistic light falloff and subtle contour highlights`
      );

      return result;
    };

    const addPoseMicroNaturalization = (text: string): string => {
      let result = text;
      let applied = 0;

      // ------------------------------
      // PRIORITY 1 — POSTURE
      // ------------------------------
      if (/sitting on/i.test(result) && applied < 2) {
        result = result.replace(
          /(sitting on [^\.]+)/i,
          (match) => {
            applied++;
            return `${match}, with a slight natural asymmetry in posture`;
          }
        );
      }

      // ------------------------------
      // PRIORITY 2 — SHOULDER SHIFT
      // ------------------------------
      if (/appearing relaxed and naturally integrated/i.test(result) && applied < 2) {
        result = result.replace(
          /(appearing relaxed and naturally integrated into the environment)/i,
          (match) => {
            applied++;
            return `${match}, with a subtle shoulder alignment shift`;
          }
        );
      }

      // ------------------------------
      // PRIORITY 3 — HAND RELAXATION (OPTIONAL)
      // ------------------------------
      if (/hand resting/i.test(result) && applied < 2) {
        result = result.replace(
          /(hand resting[^,\.]*)/i,
          (match) => {
            applied++;
            return `${match}, with relaxed fingers and wrist`;
          }
        );
      }

      return result;
    };

    const removeDuplicateSentenceTail = (text: string): string => {
      return text.replace(/\b(\w+\.)\s*\1\b/gi, "$1");
    };

    const humanizeFlow = (text: string): string => {
      return text
        // collapse repetitive "with"
        .replace(/(,?\swith\s)/gi, ", ")
        
        // fix double commas from collapse
        .replace(/,\s*,/g, ", ")
        
        // merge micro realism phrases more naturally
        .replace(
          /natural weight distribution, subtle surface compression, slight natural asymmetry in posture/gi,
          "natural weight distribution with subtle surface compression and slight asymmetry in posture"
        )

        // smooth shoulder phrasing
        .replace(
          /subtle shoulder alignment shift, natural weight distribution/gi,
          "a subtle shoulder alignment shift with natural weight distribution"
        )

        // remove leftover awkward starts
        .replace(/, appearing/gi, " and appearing")

        // final cleanup
        .replace(/\s+/g, " ")
        .trim();
    };

    const fixStructuralFlow = (text: string): string => {
      return text
        // remove duplicated words (a a, with with, etc)
        .replace(/\b(\w+)\s+\1\b/gi, "$1")

        // fix double commas / broken separators
        .replace(/,\s*,/g, ",")
        .replace(/\.\s*\./g, ".")

        // fix repeated "perspective"
        .replace(/perspective\.\s*perspective/gi, "perspective")

        // fix broken clause like ", with ..., with ..."
        .replace(/(, with [^,]+), with/gi, "$1 and with")

        // fix sentence flow (comma overload → proper split)
        .replace(/, ([a-z])/g, (_match, p1) => `. ${p1.toUpperCase()}`)

        // normalize spacing
        .replace(/\s+/g, " ")
        .trim();
    };

    const fixSentenceFlow = (text: string): string => {
      return text
        // gabungkan kalimat pendek yang salah pecah
        .replace(/\.\s+(Which|With|And|A|The)\b/g, ", $1")
        
        // perbaiki double fragment awkward
        .replace(/,\s+(which fits naturally),\s+(the overall setting)/gi,
          ", which fits naturally with the overall setting"
        )

        // hapus fragment berdiri sendiri
        .replace(/\.\s+(The overall setting)\./gi, "")

        // gabungkan descriptive fragments
        .replace(/\.\s+(Natural fabric folds[^.]+)\./gi, ", $1")

        // normalize excessive dot splitting
        .replace(/\.{2,}/g, ".")

        // cleanup spacing
        .replace(/\s+/g, " ")
        .trim();
    };

    const fixGrammarStructure = (text: string): string => {
      return text
        // fix comma + capital misuse
        .replace(/,\s+(The subject)/g, ". $1")

        // fix missing subject continuation
        .replace(/The subject is sitting on ([^.]+)\.\s+([A-Z][a-z]+s? crossed)/g,
          "The subject is sitting on $1 with $2"
        )

        // fix fragment starting with verb
        .replace(/\.\s+(Legs crossed[^.]+)/g,
          ", legs crossed$1".replace("Legs", "")
        )

        // fix capital misuse mid sentence
        .replace(/,\s+([A-Z][a-z]+)/g, (m, w) => {
          if (["The", "A", "They"].includes(w)) return `. ${w}`;
          return `, ${w.toLowerCase()}`;
        })

        // fix lighting sentence fragmentation
        .replace(/warm ambient\.\s+soft shadow and subtle wrap lighting/gi,
          "warm ambient, soft shadow and subtle wrap lighting"
        )

        .replace(/\.?\s+Realistic light falloff/gi,
          ", realistic light falloff"
        )

        // remove trailing fragment sentences
        .replace(/\.\s+(Natural depth and shadow)\./gi,
          ", natural depth and shadow"
        )

        // normalize spacing
        .replace(/\s+/g, " ")
        .trim();
    };

    const reassembleSentence = (text: string): string => {
      return text
        // gabung fragment environment
        .replace(/area\.\s+([A-Z][a-z]+ leather[^.]+)/i,
          "area with $1"
        )

        // fix "Legs crossed"
        .replace(/\bLegs crossed\b/g, "legs crossed")

        // gabung lighting fragment
        .replace(/natural daylight\.\s+Directional sunlight\.\s+Defined shadows\.\s+Realistic falloff and subtle skin highlights from sun exposure/gi,
          "natural daylight, directional sunlight, defined shadows with realistic falloff and subtle skin highlights from sun exposure"
        )

        // fix double "and appearing"
        .replace(/and appearing/gi, ", appearing")

        // gabung broken clause "Captured from"
        .replace(/areas?\s+Captured from/gi,
          "areas, captured from"
        )

        // fix capital mid sentence
        .replace(/,\s+A\s+/g, ", a ")

        // fix multiple sentence fragments into commas
        .replace(/\.\s+(a|with|and|creating|captured)/gi,
          ", $1"
        )

        // normalize spacing
        .replace(/\s+/g, " ")
        .trim();
    };

    const finalHumanize = (text: string): string => {
      return text
        // fix mid sentence capitalization
        .replace(/\bBlack leather\b/g, "black leather")
        .replace(/\bCreating a cohesive\b/g, "creating a cohesive")

        // convert comma chain to "with"
        .replace(/, a subtle shoulder alignment shift/gi,
          ", with a subtle shoulder alignment shift"
        )

        .replace(/, a slight natural asymmetry/gi,
          ", with a slight natural asymmetry"
        )

        // fix fabric → captured break
        .replace(/contact areas, captured from/gi,
          "contact areas. Captured from"
        )

        // fix lighting flow
        .replace(/lighting, realistic light falloff/gi,
          "lighting, with realistic light falloff"
        )

        // normalize multiple "with"
        .replace(/with with/gi, "with")

        // spacing
        .replace(/\s+/g, " ")
        .trim();
    };

    const fixSentenceBoundary = (text: string): string => {
      return text
        // FIX ENV SPLIT
        .replace(/lounge\.\s+black leather/gi,
          "lounge with black leather"
        )

        // FIX SUBJECT SPLIT
        .replace(/sofa\.\s+One leg crossed/gi,
          "sofa with one leg crossed"
        )

        // NORMALIZE LOWERCASE mid sentence
        .replace(/\.\s+([a-z])/g, (m, p1) => ". " + p1.toUpperCase())

        // FIX DOUBLE WITH CHAIN
        .replace(/with ([^,]+) with ([^,]+)/gi,
          "with $1, $2"
        )

        // FIX SUBJECT FLOW
        .replace(/one leg crossed and hands resting/gi,
          "one leg crossed with hands resting"
        )

        // REMOVE HARD BREAKS BEFORE CLAUSE
        .replace(/\.\s+(with|and|creating)/gi,
          ", $1"
        )

        // CLEAN SPACING
        .replace(/\s+/g, " ")
        .trim();
    };

    function mergeBrokenSentences(text: string): string {
      return text
        // MERGE short fragments (1–4 words after period)
        .replace(/\. (\w{1,12})(?: (\w{1,12}))?(?: (\w{1,12}))?\./g,
          (match, a, b, c) => {
            const fragment = [a, b, c].filter(Boolean).join(" ");
            return ` ${fragment}.`;
          }
        )

        // MERGE noun fragments after period
        .replace(/\. ([a-z][^\.]{0,40})/g,
          (match, fragment) => {
            // if fragment has no verb → join
            if (!/(is|are|was|were|with|and|creating|captured)/i.test(fragment)) {
              return ` ${fragment}`;
            }
            return match;
          }
        )

        // FIX camera split generically
        .replace(/Captured from a ([^.]+)\.\s+([^.]+ perspective)/gi,
          "Captured from a $1 $2"
        )

        // FIX ending clause
        .replace(/,\s+natural depth and shadow/gi,
          " with natural depth and shadow"
        )

        // CLEAN
        .replace(/\s+/g, " ")
        .trim();
    }

    function fixAttributeSeparator(text: string): string {
      return text.replace(
        /(Average height|Average build|Fit|Lean|Balanced)(\s+)(?=[A-Z])/g,
        (_, a) => `${a}, `
      );
    }

    // 🔴 WAJIB PALING AKHIR (V5.6.12B)
    function finalizeMasterPrompt(text: string): string {
      return text
        .replace(/V5\s+5\.\s*0/gi, "V5.5.0")
        .replace(/Average build\s+Balanced/gi, "Average build, Balanced")
        .replace(/lighting\s+Shadow\.\s+Depth/gi, "lighting, shadow, and depth")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeFinalText(text: string): string {
      return text
        // FIX duplicate words (case insensitive)
        .replace(/\b(\w+)\s+\1\b/gi, "$1")

        // FIX camel/merge duplication (legs crossedLegs → legs crossed)
        .replace(/([a-z])([A-Z])/g, "$1 $2")

        // FIX sentence fragments after period
        .replace(/\. ([A-Z][a-z]+)\./g, ", $1")

        // FIX "Eye level" mid sentence
        .replace(/\b(Eye level|Low angle|High angle)\b/g, (m) => m.toLowerCase())

        // FIX multiple spaces
        .replace(/\s+/g, " ")

        .trim();
    }

    function normalizeAdvancedText(text: string): string {
      return text

        // ===============================
        // FIX PHRASE DUPLICATION (2–5 words)
        // ===============================
        .replace(
          /\b((?:\w+\s+){1,4}\w+)\s+\1\b/gi,
          "$1"
        )

        // ===============================
        // FIX MERGE ENV FRAGMENTS
        // ===============================
        .replace(
          /\b(indoor|outdoor)\s+([a-z]+)\s+([A-Z][a-z]+)/g,
          (_, a, b, c) => `${a} ${b} with ${c.toLowerCase()}`
        )

        // ===============================
        // FIX DOUBLE WORD AFTER SPLIT
        // ===============================
        .replace(/\b(\w+)\s+(\1)\b/gi, "$1")

        // ===============================
        // CLEAN SPACING
        // ===============================
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeCanonical(text: string): string {
      return text

        // ===============================
        // ENV FIX (fragment join)
        // ===============================
        .replace(
          /\b(indoor|outdoor|restaurant|cafe|bar)\s+([A-Z][a-z]+.*?)(?=\.)/g,
          (_, a, b) => `${a} with ${b.toLowerCase()}`
        )

        // ===============================
        // CAMERA NORMALIZATION
        // ===============================
        .replace(
          /\b(medium shot|close up|wide shot)\s+(eye[- ]level|low angle|high angle).*?(perspective|angle)?/gi,
          (_, shot, angle) => `${shot} at ${angle.toLowerCase()}`
        )

        // ===============================
        // FIX RANDOM CAPITAL CHAINS
        // ===============================
        .replace(/\b([a-z]+)\s+([A-Z][a-z]+)/g, (_, a, b) => `${a} ${b.toLowerCase()}`)

        // ===============================
        // CLEAN SPACING
        // ===============================
        .replace(/\s+/g, " ")
        .trim();
    }

    function mergeEnvFragmentsGeneric(text: string): string {
      return text

        // ===============================
        // GENERIC ENV MERGE
        // ===============================
        .replace(
          /\bin a ([^.]+)\.\s*([A-Z][^.]+)\./g,
          (_, place, detail) => {
            // hindari merge kalau kalimat berikutnya bukan env
            if (detail.match(/The subject|They are|Captured|The scene/i)) {
              return `in a ${place}. ${detail}.`;
            }

            return `in a ${place} with ${detail.toLowerCase()}`;
          }
        )

        // ===============================
        // CLEAN DOUBLE PERIOD
        // ===============================
        .replace(/\.\s*\./g, ".")

        // ===============================
        // CLEAN SPACING
        // ===============================
        .replace(/\s+/g, " ")
        .trim();
    }

    function fixSentenceBoundaryAndPose(text: string): string {
      return text

        // ===============================
        // FIX MISSING PERIOD BEFORE SUBJECT
        // ===============================
        .replace(
          /([a-z])\s+(The subject)/g,
          (_, a, b) => `${a}. ${b}`
        )

        // ===============================
        // MERGE POSE FRAGMENT
        // ===============================
        .replace(
          /(The subject is [^.]+)\.\s*(Crossed legs|Legs crossed)/gi,
          (_, a, b) => `${a} with ${b.toLowerCase()}`
        )

        // ===============================
        // NORMALIZE POSE WORDING
        // ===============================
        .replace(/with crossed legs/gi, "with legs crossed")

        // ===============================
        // CLEAN DOUBLE PERIOD
        // ===============================
        .replace(/\.\s*\./g, ".")

        // ===============================
        // CLEAN SPACING
        // ===============================
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeMicroStructure(text: string): string {
      return text

        // ===============================
        // FIX ENV ENUM
        // ===============================
        .replace(
          /Shelves Bottles/gi,
          "shelves with bottles"
        )

        // ===============================
        // MERGE DRINK POSE
        // ===============================
        .replace(
          /(sitting at a bar)\.\s*(Drink in hand)/gi,
          (_, a, b) => `${a} with a ${b.toLowerCase()}`
        )

        // ===============================
        // FIX CAMERA PHRASE
        // ===============================
        .replace(
          /medium shot slightly high angle,?\s*Perspective/gi,
          "medium shot from a slightly high angle"
        )

        // ===============================
        // CLEAN CAPITALIZATION (INLINE FIX)
        // ===============================
        .replace(/,\s*([A-Z][a-z]+\swith)/g, (_, a) => `, ${a.toLowerCase()}`)

        // ===============================
        // FINAL CLEAN
        // ===============================
        .replace(/\.\s*\./g, ".")
        .replace(/\s+/g, " ")
        .trim();
    }

    function polishNaturalFlow(text: string): string {
      return text
    
        // FIX LIGHTING FLOW
        .replace(
          /soft diffused indoor and natural shadow falloff/gi,
          "soft diffused indoor lighting with natural shadow falloff"
        )
    
        // SIMPLIFY CAMERA
        .replace(
          /Captured from a medium shot perspective/gi,
          "Captured from a medium shot"
        )
    
        // IMPROVE POSE FLOW
        .replace(
          /seated,\s*legs crossed/gi,
          "seated with legs crossed"
        )
    
        .replace(/\s+/g, " ")
        .trim();
    }

    // ======================================
    // # PATCH — V5.6.23 (CONTROLLED TEXT NORMALIZER)
    // ======================================
    function stabilizeTextSafe(text: string): string {
      // 1. Fix broken lighting sentence (targeted)
      text = text.replace(
        /(neon ambient|warm ambient|natural daylight)\.\s*/gi,
        '$1 lighting with '
      );

      // 2. Merge lighting components safely
      text = text.replace(
        /(lighting with [^\.]+?)\.\s*([A-Z])/g,
        '$1, $2'
      );

      // 3. Remove semantic duplicate (relaxed)
      text = text.replace(
        /sitting relaxed[^,]*, appearing relaxed/gi,
        'sitting in a relaxed posture'
      );

      // 4. Fix double shot conflict
      text = text.replace(
        /\b(medium full shot|full medium shot)\b/gi,
        'medium shot'
      );

      // 5. Normalize perspective phrase
      text = text.replace(
        /from a slightly elevated side perspective/gi,
        'from a slightly elevated angle'
      );

      // 6. Clean punctuation (SAFE ONLY)
      text = text.replace(/\s+,/g, ',');
      text = text.replace(/\s{2,}/g, ' ').trim();

      return text;
    }

    // ======================================
    // # PATCH — V5.6.24 (PHRASE SANITIZER LOCK)
    // ======================================
    function sanitizePhrases(text: string): string {
      // 1. Remove exact phrase duplication (global safe)
      text = text.replace(
        /\b(.{10,}?)\b(?:,\s*\1\b)+/gi,
        '$1'
      );

      // 2. Remove repeated short phrases (like "subtle wrap light subtle wrap light")
      text = text.replace(
        /\b(\w+(?:\s+\w+){1,4})\s+\1\b/gi,
        '$1'
      );

      // 3. Fix "subject is subject"
      text = text.replace(
        /\bsubject is subject\b/gi,
        'subject is'
      );

      // 4. Collapse repeated "with ..."
      text = text.replace(
        /(with [^,]+)(,\s*with [^,]+)+/gi,
        '$1'
      );

      // 5. Remove broken lighting fragments
      text = text.replace(
        /(subtle wrap light\.?\s*){2,}/gi,
        'subtle wrap lighting'
      );

      // 6. Clean dangling fragments
      text = text.replace(
        /\.\s*[A-Z][a-z]+\s+[a-z]+\s*\./g,
        '.'
      );

      // 7. Normalize spacing
      text = text.replace(/\s{2,}/g, ' ').trim();

      return text;
    }

    // ======================================
    // # PATCH — V5.6.25 (STRUCTURAL SENTENCE COMPRESSOR)
    // ======================================
    function compressStructure(text: string): string {
      // 1. Merge fragmented lighting sentences
      text = text.replace(
        /(natural daylight|warm ambient lighting|neon ambient lighting)[^\.]*\.\s*([A-Z][^\.]*\.)\s*([A-Z][^\.]*\.)/gi,
        (_, a, b, c) => {
          return `${a} with ${b.replace('.', '')}, ${c.toLowerCase()}`;
        }
      );

      // 2. Merge short broken lighting chains
      text = text.replace(
        /(lighting[^\.]*)\.\s*([a-z])/gi,
        '$1, $2'
      );

      // 3. Fix duplicated fabric phrase (non-adjacent)
      text = text.replace(
        /(natural fabric folds[^\.]*?)\s+\1/gi,
        '$1'
      );

      // 4. Normalize lighting chain into single sentence
      text = text.replace(
        /The scene is illuminated by ([^\.]+)\.\s*([^\.]+)\.\s*([^\.]+)\./gi,
        (_, a, b, c) => {
          return `The scene is illuminated by ${a}, ${b.toLowerCase()}, and ${c.toLowerCase()}.`;
        }
      );

      // 5. Clean leftover fragments
      text = text.replace(/\.\s*\./g, '.');

      // 6. Final spacing
      text = text.replace(/\s{2,}/g, ' ').trim();

      return text;
    }

    // ======================================
    // # PATCH — V5.6.26 (NATURAL FLOW LOCK)
    // ======================================
    function naturalFlow(text: string): string {
      // 1. Merge broken environment intro sentence
      text = text.replace(
        /a realistic photo of a person in ([^\.]+)\.\s*([A-Z][^\.]+theme)\./gi,
        'a realistic photo of a person in $1 with $2.'
      );

      // 2. Normalize lighting chain (remove redundancy + reorder)
      text = text.replace(
        /subtle contour highlights\s+natural shadow falloff/gi,
        'natural shadow falloff with subtle contour highlights'
      );

      // 3. Remove duplicated falloff mentions
      text = text.replace(
        /realistic falloff[^,\.]*,\s*/gi,
        ''
      );

      // 4. Fix wrap light phrasing
      text = text.replace(
        /Subtle wrap light\.?/gi,
        'subtle wrap lighting'
      );

      // 5. Merge fragmented lighting phrases into one
      text = text.replace(
        /lighting, ([^\.]+)\. ([A-Z][^\.]+)/gi,
        (match, a, b) => {
          return `lighting with ${a}, ${b.toLowerCase()}`;
        }
      );

      // 6. Fix capitalization mid sentence
      text = text.replace(
        /,\s*([A-Z][a-z]+)/g,
        (m, w) => `, ${w.toLowerCase()}`
      );

      // 7. Clean spacing
      text = text.replace(/\s{2,}/g, ' ').trim();

      return text;
    }

    function enforceVariableCase(text: string): string {
      return text
        .replace(/\bmain_scene\b/g, "MAIN_SCENE")
        .replace(/\btarget_subject\b/g, "TARGET_SUBJECT")
        .replace(/\boutfit_reference\b/g, "OUTFIT_REFERENCE");
    }

    function finalSanityClean(text: string): string {
      return text
        // remove duplicate phrases (exact repeat)
        .replace(/\b(.+?)\b(?:\s+\1\b)+/gi, "$1")

        // fix "subject is subject"
        .replace(/\bsubject is subject\b/gi, "subject is")

        // remove duplicated lighting segments
        .replace(/(soft shadows and subtle light wrap)(.*?\1)/gi, "$1")

        // fix sentence fragmentation (dot + capital continuation)
        .replace(/\. ([A-Z][a-z]+ (leg|arm|hand))/g, ", $1")

        // normalize multiple spaces
        .replace(/\s{2,}/g, " ")

        .trim();
    }

    function fixDoublePunctuation(text: string): string {
      return text
        .replace(/\.\s*\./g, ".") // remove double dots
        .replace(/\. (\w+)\./g, ". $1"); // remove broken trailing fragments
    }

    function stabilizeVisualDescription(text: string): string {
      return text
        .replace(/volumetric edge glow/gi, "soft environmental glow")
        .replace(/complex color spill/gi, "natural color spill")
        .replace(/directional magenta spill/gi, "subtle colored lighting")
        .replace(/cyan light reflections/gi, "soft light reflections")
        .replace(/\bwith\b\s+\bwith\b/gi, "with")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function cleanPhraseCollision(text: string): string {
      return text
        // duplicate connector cleanup
        .replace(/\bwith\s+with\b/gi, "with")

        // repeated phrase cleanup
        .replace(/captured from([^.]*)captured from/gi, "captured from")

        // duplicate perspective word
        .replace(/\bperspective\.\s*perspective\b/gi, "perspective")

        // duplicate spacing
        .replace(/\s{2,}/g, " ")

        // repeated punctuation
        .replace(/\.{2,}/g, ".")

        .trim();
    }

    // ======================================
    // SLOT SYSTEM V1.1 (UPDATED FOR PRIORITY ENGINE)
    // CRITICAL SAFE
    // ======================================
    type SlotValue = { value: string; priority: number };

    type SlotMap = {
      IDENTITY_SLOT?: SlotValue;
      PRESENCE_SLOT?: SlotValue;
      MICRO_DETAIL_SLOT?: SlotValue;
      LIGHTING_SLOT?: SlotValue;
      ENV_BIND_SLOT?: SlotValue;
    };

    const PRIORITY = {
      SCENE: 5,          // MAIN_SCENE (ABSOLUTE)
      EXECUTION: 4,      // Master Prompt Rules
      SLOT: 3,           // Slot System Output
      VISUAL: 2,         // Visual Simulation text
      GENERIC: 1         // fallback descriptors
    };

    type BuildContext = {
      hasIdentity: boolean;
      hasPresence: boolean;
      hasMicroDetail: boolean;
      hasLighting: boolean;
      hasEnvironmentBinding: boolean;
    };

    function createContext(): BuildContext {
      return {
        hasIdentity: false,
        hasPresence: false,
        hasMicroDetail: false,
        hasLighting: false,
        hasEnvironmentBinding: false,
      };
    }

    function createSlotMap(): SlotMap {
      return {};
    }

    function setSlot(
      slots: SlotMap,
      key: keyof SlotMap,
      value: string,
      priority: number = PRIORITY.SLOT
    ): SlotMap {
      if (!slots[key]) {
        slots[key] = { value, priority };
      }
      return slots;
    }

    function buildSlotOutput(slots: SlotMap): string {
      return [
        slots.IDENTITY_SLOT?.value,
        slots.PRESENCE_SLOT?.value,
        slots.MICRO_DETAIL_SLOT?.value,
        slots.LIGHTING_SLOT?.value,
        slots.ENV_BIND_SLOT?.value,
      ]
        .filter(Boolean)
        .join(" ");
    }

    // ======================================
    // PRIORITY RESOLUTION ENGINE V1.0
    // CRITICAL SAFE
    // ======================================
    function detectLightingConflict(text: string): boolean {
      const lower = text.toLowerCase();
      // Detect common mutually exclusive lighting descriptors
      return (
        (/warm/i.test(lower) && /cool|cyan|blue/i.test(lower)) ||
        (/neon/i.test(lower) && /ambient|natural/i.test(lower)) ||
        (/soft/i.test(lower) && /harsh|directional/i.test(lower))
      );
    }

    function resolveByPriority(
      base: string,
      incoming: string,
      basePriority: number,
      incomingPriority: number
    ): string {
      if (incomingPriority > basePriority) {
        return incoming;
      }
      return base;
    }

    function resolveLightingConflict(
      existing: string,
      incoming: string,
      existingPriority: number,
      incomingPriority: number
    ): string {
      if (!detectLightingConflict(existing + " " + incoming)) {
        return existing + ", " + incoming;
      }
      return resolveByPriority(
        existing,
        incoming,
        existingPriority,
        incomingPriority
      );
    }

    function injectWithPriority(
      current: string,
      addition: string,
      priority: number,
      currentPriority: number
    ): string {
      if (!current) return addition;
      return resolveByPriority(current, addition, currentPriority, priority);
    }

    function setSlotWithPriority(
      slots: SlotMap,
      key: keyof SlotMap,
      value: string,
      priority: number
    ): SlotMap {
      const existing = slots[key];
      slots[key] = {
        value: injectWithPriority(
          existing?.value || "",
          value,
          priority,
          existing?.priority || 0
        ),
        priority: Math.max(existing?.priority || 0, priority)
      };
      return slots;
    }

    function resolveAllConflicts(text: string): string {
      // Apply specialized lighting resolution pass
      // In this version, we focus on lighting as it's the primary collision point
      if (detectLightingConflict(text)) {
          // Selective resolution logic can be expanded here
          // For now, we rely on the builder-level resolution to prevent conflicts before they enter text
      }
      return text;
    }


    function applyIdentityLockToSlot(slots: SlotMap, ctx: BuildContext) {
      if (ctx.hasIdentity) return;
      setSlotWithPriority(
        slots,
        "IDENTITY_SLOT",
        "Facial proportions remain stable with consistent cranial structure.",
        PRIORITY.SLOT
      );
      ctx.hasIdentity = true;
    }

    function applyPresenceLockToSlot(slots: SlotMap, ctx: BuildContext) {
      if (ctx.hasPresence) return;
      
      const physics = buildAnatomySurfacePhysics(anatomyProfile);
      
      setSlotWithPriority(
        slots,
        "PRESENCE_SLOT",
        `The subject exhibits subtle gravitational presence consistent with real-world physics. ${physics}`,
        PRIORITY.SLOT
      );
      ctx.hasPresence = true;
    }

    function applyMicroDetailToSlot(slots: SlotMap, ctx: BuildContext) {
      if (ctx.hasMicroDetail) return;
      
      const interaction = buildAnatomyMaterialInteraction(anatomyProfile);
      
      setSlotWithPriority(
        slots,
        "MICRO_DETAIL_SLOT",
        `Skin exhibits fine texture with visible pores and natural tonal variation. ${interaction}`,
        PRIORITY.SLOT
      );
      ctx.hasMicroDetail = true;
    }

    function applyLightingResponseToSlot(slots: SlotMap, ctx: BuildContext) {
      if (ctx.hasLighting) return;
      
      const wrap = buildAnatomyLightingWrap(anatomyProfile);
      const sss = buildAdaptiveSSSPatch(data.analysis?.lighting || "", data.analysis?.skin_tone || "");
      
      setSlotWithPriority(
        slots,
        "LIGHTING_SLOT",
        `All surfaces respond naturally to environmental lighting conditions. ${wrap} ${sss}`,
        PRIORITY.SLOT
      );
      ctx.hasLighting = true;
    }

    function applyEnvironmentBindToSlot(slots: SlotMap, ctx: BuildContext) {
      if (ctx.hasEnvironmentBinding) return;
      
      const atmos = buildAtmosphericDepthPatch(data.analysis?.environment || "");
      const lens = buildCameraLensFidelityPatch(data.analysis?.camera || "");
      
      setSlotWithPriority(
        slots,
        "ENV_BIND_SLOT",
        `Subject remains fully integrated within the environmental depth and lighting context. ${atmos} ${lens}`,
        PRIORITY.SLOT
      );
      ctx.hasEnvironmentBinding = true;
    }


    function buildAllSlots(): string {
      const slots = createSlotMap();
      const ctx = createContext();

      applyIdentityLockToSlot(slots, ctx);
      applyPresenceLockToSlot(slots, ctx);
      applyMicroDetailToSlot(slots, ctx);
      applyLightingResponseToSlot(slots, ctx);
      applyEnvironmentBindToSlot(slots, ctx);

      return buildSlotOutput(slots);
    }

    // ======================================
    // ======================================
    // VISUAL SENTENCE COMPRESSOR V1.0

    // STRICT SAFE POST PROCESS
    // ======================================
    function compressVisualSentence(text: string): string {
      return text
        // remove duplicated "captured from"
        .replace(
          /captured from an? ([^.]*) captured from/gi,
          "captured from a $1"
        )
        // remove duplicate "perspective"
        .replace(
          /\bperspective\.\s*perspective\b/gi,
          "perspective"
        )
        // normalize "with a ... perspective"
        .replace(
          /with a ([^.]*) perspective/gi,
          "in a $1 view"
        )
        // normalize "medium close-up perspective"
        .replace(
          /\bmedium close-up perspective\b/gi,
          "medium close-up shot"
        )
        // normalize repeated "shot shot"
        .replace(
          /\bshot shot\b/gi,
          "shot"
        )
        // compress whitespace
        .replace(/\s+/g, " ")
        // clean accidental double periods
        .replace(/\.{2,}/g, ".")
        .trim();
    }

    // ======================================
    // CAMERA CONTEXT NORMALIZER V1.0
    // STRICT SAFE POST PROCESS
    // ======================================
    function normalizeCameraContext(text: string): string {
      return text
        // unify "perspective" → "view"
        .replace(/\bperspective\b/gi, "view")
        // remove "angle" when redundant with eye-level
        .replace(/\beye[- ]level angle\b/gi, "eye-level")
        // normalize "from an eye-level view shot" → "from an eye-level shot"
        .replace(
          /from an? ([^.]*) view shot/gi,
          "from an $1 shot"
        )
        // normalize "shot in a ... view"
        .replace(
          /shot in a ([^.]*) view/gi,
          "shot in a $1 view"
        )
        // remove duplicate camera phrases
        .replace(
          /(eye-level shot[^.]*)(eye-level shot)/gi,
          "$1"
        )
        .trim();
    }

    // ======================================
    // DESCRIPTOR PRIORITY RESOLVER V1.0
    // STRICT SAFE POST PROCESS
    // ======================================
    function resolveLightingPriority(text: string): string {
      return text.replace(
        /(neon ambient lighting)(.*?)(cyan|magenta|blue|red)([^,.]*)/gi,
        (_, primary, middle, color, tail) => {
          return `${primary} as the dominant light source, with subtle ${color}${tail}`;
        }
      )
      // soften secondary descriptors
      .replace(
        /\b(directional|strong|intense)\b/gi,
        "subtle"
      )
      // normalize glow wording
      .replace(
        /\b(glow|volumetric glow)\b/gi,
        "light diffusion"
      );
    }

    // ======================================
    // CAMERA CONTEXT NORMALIZER V1.0

    function injectSlots(text: string, slotOutput: string): string {
      if (!slotOutput) return text;

      let newText = text;

      // 1. SKIN & MATERIAL INTEGRATION
      if (/SKIN & MATERIAL INTEGRATION:/i.test(newText)) {
          newText = newText.replace(
            /SKIN & MATERIAL INTEGRATION:/i,
            `SKIN & MATERIAL INTEGRATION:\n${slotOutput}`
          );
      }

      // 2. VISUAL TARGET INJECTION
      // Updated regex to catch the specific phrase from buildNanoPrompt
      const step3Pattern = /Create a realistic reconstructed subject integrated naturally into MAIN_SCENE\./gi;
      if (step3Pattern.test(newText)) {
          newText = newText.replace(
            step3Pattern,
            match => match + " " + slotOutput
          );
      }

      return newText;
    }

    // ======================================
    // GLOBAL SENTENCE DEDUPER V1.0

    // ======================================
    // GLOBAL SENTENCE DEDUPER V1.0
    // CRITICAL SAFE
    // ======================================
    function dedupeSentences(text: string): string {
      const seen = new Set<string>();
      return text
        .split(/(?<=[.!?])\s+/)
        .filter(sentence => {
          const normalized = sentence.trim().toLowerCase();
          if (!normalized) return false;
          if (seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .join(" ");
    }

    function cleanInlineDuplicates(text: string): string {
      return text.replace(/\b(.+?)\s+\1\b/gi, "$1");
    }

    function pruneTokens(text: string): string {
      const lines = text.split(/\n+/);
      const seen = new Set<string>();
      return lines
        .map(line => line.trim())
        .filter(line => {
          const normalized = line
            .toLowerCase()
            .replace(/[^\w\s]/g, "") // remove punctuation
            .replace(/\s+/g, " ");
          if (!normalized) return false;
          if (seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .join("\n");
    }

    function compressInlineRepeats(text: string): string {
      return text.replace(
        /\b(.+?)\b(?:,\s*\1\b)+/gi,
        "$1"
      );
    }

    function fixCapitalization(text: string): string {
      return text.replace(/Eye-level/g, "eye-level");
    }

    function fixNegativeStructure(text: string): string {
      return text.replace(
        /- No over-smoothing\s*- ([^\n]+)/g,
        (_, list) => {
          return `- No over-smoothing or ${list}`;
        }
      );
    }

    function fixSubjectPhrase(text: string): string {
      return text.replace(
        /person with ([^,]+) subject with ([^,]+)/gi,
        (_, a, b) => {
          return `${a.trim()} person with ${b.trim()}`;
        }
      );
    }

    function fixRandomCaps(text: string): string {
      return text.replace(
        /\b(Sitting|Standing|Walking|Leaning)\b/g,
        (word) => word.toLowerCase()
      );
    }

    function cleanMicroArtifacts(text: string): string {
      return text
        // remove broken perspective fragment
        .replace(/.?\s*perspective\b/gi, "")
        // normalize common camera phrase capitalization
        .replace(/\bThree-quarters\b/g, "three-quarters")
        .replace(/\bMedium-low\b/g, "medium-low")
        .replace(/\bEye-level\b/g, "eye-level")
        // remove accidental double spaces
        .replace(/\s{2,}/g, " ")
        // trim spacing before punctuation
        .replace(/\s+([.,])/g, "$1");
    }

    function fixBrokenSentences(text: string): string {
      return text
        .replace(/shot\.\s*perspective/gi, "shot perspective")
        .replace(/creating and a\b/gi, "creating natural depth and a cohesive atmosphere");
    }

    function enforceLightingLimit(text: string): string {
      // Normalize commas
      let cleaned = text.replace(/\s*,\s*/g, ", ");

      // Process all sentences
      const sentences = cleaned.split(". ");
      
      const limited = sentences.map(s => {
        if (s.toLowerCase().includes("illuminated by")) {
          // If it already has shadows and wrap, don't just truncate
          if (s.toLowerCase().includes("shadow") && s.toLowerCase().includes("wrap")) {
             return s;
          }
          // Otherwise, apply a light touch - capture first source and append standard descriptors if missing
          return s.replace(
            /(illuminated by )([^,]+).*$/i,
            "$1$2 with soft shadows, creating natural depth and a cohesive atmosphere"
          );
        }
        return s;
      });

      return limited.join(". ");
    }

    function cleanLightingDuplicates(text: string): string {
      return text
        // remove duplicated shadow phrases
        .replace(/(soft shadows)[^,]*\1/gi, "soft shadows")
        
        // remove repeated "subtle light wrap"
        .replace(/(subtle light wrap)[^,]*\1/gi, "subtle light wrap")
        
        // normalize accidental repetition patterns
        .replace(/\b(\w+)\s+\1\b/gi, "$1");
    }

    function cleanLightingSemantic(text: string): string {
      return text
        // normalize "with soft shadows" → remove if already mentioned
        .replace(/soft shadows[^.]*with soft shadows/gi, "soft shadows")

        // normalize reverse order
        .replace(/with soft shadows[^.]*soft shadows/gi, "soft shadows")

        // remove duplicate wrap mentions
        .replace(/subtle light wrap[^.]*subtle light wrap/gi, "subtle light wrap")

        // remove filler connectors that reintroduce same concept
        .replace(/,?\s*with soft shadows/gi, "")

        // clean accidental double spaces
        .replace(/\s{2,}/g, " ")

        // clean grammar artifacts
        .replace(/\s+,/g, ",")
        .trim();
    }

    function normalizeLightingCanonical(text: string, options?: { preserveComponents?: boolean }): string {
      let result = text
        // unify shadow
        .replace(/\bsoft shadow\b/gi, "soft shadows")

        // unify wrap variants
        .replace(/\bsubtle wrap lighting\b/gi, "subtle light wrap")
        .replace(/\bwrap lighting\b/gi, "light wrap")

        // unify ambient
        .replace(/\bwarm ambient\b/gi, "warm ambient lighting")

        // cleanup double lighting wording
        .replace(/lighting lighting/gi, "lighting");

      if (options?.preserveComponents) {
        // Ensure we don't accidentally strip 'subtle light wrap' or 'soft shadows' if they exist twice
        // but normalize them first.
      }

      return result.trim();
    }

    function fixArticleGrammar(text: string): string {
      return text.replace(/\b(a|an)\s+([a-zA-Z]+)/gi, (match, article, word) => {
        const first = word.charAt(0).toLowerCase();
        const correct = "aeiou".includes(first) ? "an" : "a";
        return `${correct} ${word}`;
      });
    }

    function normalizeListComma(text: string): string {
      return text.replace(
        /(\bsoft shadows)\s+and\s+(subtle light wrap)/gi,
        "$1, $2"
      );
    }

    function removePerspectiveSuffix(text: string): string {
      return text.replace(/shot perspective/gi, "shot");
    }

    // ======================================
    // INSTRUCTION WEIGHT NORMALIZER V1.0
    // CRITICAL SAFE
    // ======================================
    const WEIGHT_GROUP = {
      CRITICAL: [
        "no silhouette inheritance",
        "no identity blending",
        "fully reconstructed subject",
        "anatomical consistency",
      ],

      HIGH: [
        "environmental integration",
        "realistic grounding",
        "physically believable",
      ],

      MEDIUM: [
        "lighting consistency",
        "shadow behavior",
        "material response",
      ],

      LOW: [
        "micro detail",
        "texture refinement",
      ],
    };

    function normalizeInstructionWeight(text: string): string {
      let result = text;

      // CRITICAL → HARD LOCK STYLE
      WEIGHT_GROUP.CRITICAL.forEach(keyword => {
        const regex = new RegExp(`(${keyword})`, "gi");
        result = result.replace(regex, "STRICT REQUIREMENT: $1");
      });

      // HIGH → EMPHASIS
      WEIGHT_GROUP.HIGH.forEach(keyword => {
        const regex = new RegExp(`(${keyword})`, "gi");
        result = result.replace(regex, "Ensure $1");
      });

      // MEDIUM → SOFT CONTROL
      WEIGHT_GROUP.MEDIUM.forEach(keyword => {
        const regex = new RegExp(`(${keyword})`, "gi");
        result = result.replace(regex, "Maintain $1");
      });

      return result;
    }

    function preventOverNormalization(text: string): string {
      return text.replace(
        /(STRICT REQUIREMENT:\s*){2,}/gi,
        "STRICT REQUIREMENT: "
      );
    }

    // ======================================
    // ATTENTION GUIDANCE SYSTEM V1.0
    // CRITICAL SAFE
    // ======================================
    function reorderAttentionBlocks(text: string): string {
      const sections = {
        constraints: "",
        execution: "",
        structure: "",
        integration: "",
        details: "",
        rest: ""
      };

      const parts = text.split(/---/g);

      parts.forEach(part => {
        if (/STRICT CONSTRAINTS/i.test(part)) {
          sections.constraints = part;
        } else if (/EXECUTION RULE/i.test(part)) {
          sections.execution = part;
        } else if (/BODY CONTINUITY LOCK/i.test(part)) {
          sections.structure = part;
        } else if (/SKIN & MATERIAL INTEGRATION/i.test(part)) {
          sections.integration = part;
        } else if (/VISUAL TARGET INJECTION/i.test(part)) {
          sections.details = part;
        } else {
          sections.rest += part;
        }
      });

      return [
        sections.constraints,
        sections.execution,
        sections.structure,
        sections.integration,
        sections.details,
        sections.rest
      ]
        .filter(Boolean)
        .join("\n---\n");
    }

    function injectAttentionAnchors(text: string): string {
      return text
        .replace(
          /STRICT CONSTRAINTS:/g,
          "STRICT CONSTRAINTS (HIGHEST PRIORITY):"
        )
        .replace(
          /EXECUTION RULE/g,
          "EXECUTION RULE (FOLLOW EXACTLY)"
        )
        .replace(
          /FINAL RESULT:/g,
          "FINAL RESULT (OUTPUT TARGET):"
        );
    }

    function moveConstraintsToTop(text: string): string {
      const match = text.match(/STRICT CONSTRAINTS[\s\S]*?RENDER QUALITY:[\s\S]*?\n/);
      if (!match) return text;
      const constraints = match[0];
      const remaining = text.replace(constraints, "");
      return constraints + "\n" + remaining;
    }

    // ======================================
    // CORE STRUCTURE FIX V1.0
    // CRITICAL SAFE
    // ======================================
    function enforceSingleConcept(text: string): string {
      const seen = new Set<string>();
      return text
        .split(". ")
        .filter(sentence => {
          const key = sentence.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join(". ");
    }

    function normalizeSemantic(text: string): string {
      return text
        .replace(
          /fine skin texture.*visible pores.*|visible pores.*fine skin texture.*/gi,
          "fine skin texture with visible pores"
        )
        .replace(
          /facial proportions remain unchanged.*consistent head structure.*/gi,
          "facial proportions remain unchanged with consistent head structure"
        );
    }

    function removeCrossInjection(text: string): string {
      return text
        // remove identity duplication from STEP 3
        .replace(/Facial proportions remain unchanged[\s\S]*?\./gi, "")
        // remove micro detail duplication
        .replace(/Skin exhibits fine texture[\s\S]*?\./gi, "")
        // remove repeated presence
        .replace(/The subject exhibits subtle gravitational presence[\s\S]*?\./gi, "");
    }

    function enforceSeparation(text: string): string {
      return text
        // remove descriptive phrases from STEP 2
        .replace(/natural depth|cohesive atmosphere|realistic presence/gi, "")
        // remove instruction phrases from STEP 3
        .replace(/Ensure|Maintain|Apply/gi, "");
    }

    function simplifySentences(text: string): string {
      return text
        .replace(
          /with consistent head structure and stable facial ratios across different lighting conditions/gi,
          "with consistent head structure"
        )
        .replace(
          /creating natural depth and a cohesive atmosphere/gi,
          "creating natural depth"
        );
    }

    // ======================================
    // STRUCTURE NORMALIZATION FIX V1.1
    // CRITICAL SAFE
    // ======================================
    function reorderByHeaders(text: string, headers: string[]): string {
      const segments: { header: string; content: string }[] = [];
      const lines = text.split("\n");
      let currentHeader = "";
      let currentContent: string[] = [];
      let foundAny = false;

      lines.forEach(line => {
        const foundHeader = headers.find(h => line.includes(h));
        if (foundHeader) {
          if (foundAny || currentContent.length > 0) {
            segments.push({ header: currentHeader, content: currentContent.join("\n") });
          }
          currentHeader = foundHeader;
          currentContent = [line];
          foundAny = true;
        } else {
          currentContent.push(line);
        }
      });
      segments.push({ header: currentHeader, content: currentContent.join("\n") });

      if (!foundAny) return text;

      // Ensure that if we have a segment with an empty header (initial text before headers), 
      // we don't just lose it. Prepend it to the first found header.
      const initialSegment = segments.find(s => s.header === "");
      const resultParts = headers
        .map(h => {
          const seg = segments.find(s => s.header === h);
          if (!seg) return "";
          
          let content = seg.content;
          // If this is the first non-empty header in our list that we actually found, 
          // prepend the initial segment if it exists
          const firstFoundHeader = headers.find(h2 => segments.some(s => s.header === h2));
          if (h === firstFoundHeader && initialSegment) {
            content = initialSegment.content + "\n" + content;
          }
          return content;
        })
        .filter(Boolean);

      return resultParts.join("\n\n");
    }

    function enforceBlockOrder(text: string): string {
      return reorderByHeaders(text, [
        "### COMMAND — PROMPT GENERATOR",
        "### STEP 1 — INPUT",
        "### STEP 2 — EXECUTION LOCK",
        "### SUBJECT PURGE",
        "### ACCESSORY ISOLATION",
        "### RECONSTRUCTION INSTRUCTIONS",
        "### PHYSICS ENGINE LAYER",
        "### PERCEPTUAL REALISM LOCK",
        "### FINAL REALISM LOCK",
        "### STEP 3 — OUTPUT",
        "### STEP 4 — NEGATIVE"
      ]);
    }

    function removeDuplicateLines(text: string): string {
      const seen = new Set();
      return text
        .split(/(?<=[.?!])\s+/)
        .filter(line => {
          const clean = line.trim().toLowerCase();
          if (!clean) return true;
          if (seen.has(clean)) return false;
          seen.add(clean);
          return true;
        })
        .join(" ");
    }

    function cleanCommandSpam(text: string): string {
      return text.replace(/\(FOLLOW EXACTLY\)(\s*\(FOLLOW EXACTLY\))+/gi, "(FOLLOW EXACTLY)");
    }

    function applyPoseModeFilter(text: string, mode: string): string {
      if (mode === "FREE") {
        return text.replace(
          /pose behavior based on[\s\S]*?LOCKED →.*?\n/gi,
          "POSE RULE: Ignore pose from MAIN_SCENE. Generate pose only from TARGET_SUBJECT.\n"
        );
      }
      return text;
    }

    function normalizeMasterPrompt(text: string): string {
      return enforceBlockOrder(text);
    }

    // ======================================
    // AUTHORITY HIERARCHY COLLAPSE CLEANER
    // STRICT SAFE POST PROCESS
    // ======================================
    function cleanAuthorityCollisions(text: string): string {
      return text
        // compress repeated ABSOLUTE spam
        .replace(/\bABSOLUTE\b/gi, "critical")
        // compress repeated FORBIDDEN blocks
        .replace(/(FORBIDDEN:)([\s\S]*?)(FORBIDDEN:)/gi, "$1$2")
        // reduce invalid spam density
        .replace(/\bOUTPUT INVALID\b/gi, "REJECT OUTPUT")
        // stabilize reconstruction wording
        .replace(/\bDESTROY old body\b/gi, "remove old body authority")
        // stabilize rebuild wording
        .replace(/\bGenerate NEW anatomy\b/gi, "construct independent anatomy");
    }

    // ========================================
    // TRANSFORMATION MODE TERMINATOR V1
    // STRICT SAFE POST PROCESS
    // ========================================
    function terminateTransformationMode(text: string): string {
      return text
        // remove edit-style semantics
        .replace(/\b(replace|rebuild|modify|transforming|transformed|editing)\b/gi, "")
        // normalize recreation semantics
        .replace(/\bnew human\b/gi, "newly photographed subject")
        .replace(/\bnew subject\b/gi, "independent photographed subject")
        // remove relational reconstruction wording
        .replace(/\bmodified version of the old subject\b/gi, "independent human presence")
        // compress repeated reconstruction language
        .replace(/\b(entire anatomy MUST be rebuilt from TARGET_SUBJECT \+ MANUAL constraints\.)/gi, "Generate an independent photographed subject using TARGET_SUBJECT and MANUAL anatomy authority.")
        // inject occupancy semantics
        .replace(/Treat original subject area as EMPTY environment space\./gi, "Treat the environment as naturally unoccupied before the new subject exists.")
        // inject photography semantics
        .replace(/The output MUST feel like:/gi, `
The output MUST feel like:
- a naturally photographed human
- independently existing in the scene
- physically occupying the environment for the first time
`)
        // cleanup double spaces
        .replace(/\s{2,}/g, " ")
        // cleanup empty bullets
        .replace(/\*\s*\n/g, "");
    }

    // ========================================
    // MODE ISOLATION EXECUTOR V1
    // STRICT SAFE POST PROCESS
    // ========================================
    function isolateExecutionMode(
      text: string,
      mode: "FREE" | "BLEND" | "LOCKED"
    ): string {
      const modeBlockRegex = /\*\s*\[(FREE|BLEND|LOCKED)\]:[\s\S]*?(?=###|##|$)/gi;

      return text.replace(modeBlockRegex, () => {
        if (mode === "FREE") {
          return `
* [FREE]
- Generate pose independently from TARGET_SUBJECT only.
- Ignore pose rhythm, body flow, and skeleton logic from MAIN_SCENE.
- Subject must feel naturally photographed with independent posture behavior.
`;
        }

        if (mode === "BLEND") {
          return `
* [BLEND]
- Follow scene pose flow only.
- Anatomy, body proportions, and silhouette remain TARGET authority.
- Preserve environmental alignment without inheriting original anatomy.
`;
        }

        return `
* [LOCKED]
- Match scene pose structure precisely.
- Preserve TARGET anatomy identity.
- Do not reinterpret body proportions or silhouette geometry.
`;
      })
      // cleanup accidental double spacing
      .replace(/\n{3,}/g, "\n\n");
    }

    function languageFlowNormalizer(text: string): string {
  if (!text) return "";
  
  return text
    // Avoid repeated "with" in close proximity
    .replace(/(with\s+[^,.]+)\s+with\s+/gi, "$1, and with ")
    // Break long chained clauses and capitalize
    .replace(/,\s*(while|ensuring|maintaining|preserving)\s/gi, (match, p1) => {
      return ". " + p1.charAt(0).toUpperCase() + p1.slice(1) + " ";
    })
    // Fix common robotic stacking patterns
    .replace(/with a ([^,]+) with a ([^,]+)/gi, "with a $1, and $2")
    .trim();
}

function normalizeNarrative(text: string): string {
      return text;
    }

    function normalizeSimple(text: string): string {
      return text;
    }

    function normalizeAllOutputs(output: string): string {
      if (!output) return output;
      
      // Fix common typos
      let normalized = output.replace(/\bcamer\b/gi, "camera")
                      .replace(/\bcamer\./gi, "camera.")
                      .replace(/\bcamer,/gi, "camera,");

      // Inject slots using Orchestrator
      normalized = injectSlots(normalized, buildAllSlots());

      normalized = stabilizeVisualDescription(normalized);
      normalized = cleanPhraseCollision(normalized);
      normalized = compressVisualSentence(normalized);
      normalized = normalizeCameraContext(normalized);
      normalized = resolveLightingPriority(normalized);

      normalized = fixDoublePunctuation(normalized);

      normalized = fixBrokenSentences(normalized);
      normalized = removePerspectiveSuffix(normalized);

      normalized = normalizeLightingCanonical(normalized, {
        preserveComponents: true,
      });

      normalized = cleanLightingDuplicates(normalized);
      normalized = cleanLightingSemantic(normalized);
      normalized = enforceLightingLimit(normalized);
      normalized = fixArticleGrammar(normalized);
      
      // 🔴 FINAL FIX
      normalized = normalizeListComma(normalized);
      
      // Secondary pass for cleanup
      normalized = fixDoublePunctuation(normalized);

      // RESOLVE CONFLICTS
      normalized = resolveAllConflicts(normalized);
      
      normalized = normalizeSemantic(normalized);
      normalized = removeCrossInjection(normalized);
      normalized = enforceSingleConcept(normalized);
      normalized = enforceSeparation(normalized);
      normalized = simplifySentences(normalized);

      normalized = reorderAttentionBlocks(normalized);
      normalized = moveConstraintsToTop(normalized);
      normalized = injectAttentionAnchors(normalized);

      // FIX V1.1 PIPELINE - REMOVED enforceBlockOrder FROM UNIVERSAL SCOPE
      normalized = removeDuplicateLines(normalized);
      normalized = cleanCommandSpam(normalized);
      normalized = fixBrokenSentences(normalized);

      normalized = normalizeInstructionWeight(normalized);
      normalized = preventOverNormalization(normalized);

      // GLOBAL DEDUPER AKHIR
      normalized = dedupeSentences(normalized);
      normalized = cleanInlineDuplicates(normalized);
      normalized = compressInlineRepeats(normalized);
      normalized = pruneTokens(normalized);

      return normalized;
    }

    const smartArticle = (word: string): string => {
      const first = word.trim().charAt(0).toLowerCase();
      return "aeiou".includes(first) ? "an" : "a";
    };

    const mergeLightingAdvanced = (text: string): string => {
      const parts = text.split(",").map(s => s.trim());

      if (parts.length === 1) return parts[0];

      if (parts.length === 2) {
        return `${parts[0].replace(" lighting", "")} and ${parts[1]}`;
      }

      // 3+ items
      const last = parts.pop();
      return `${parts
        .map(p => p.replace(" lighting", ""))
        .join(", ")} and ${last}`;
    };

    const normalizeEnvironment = (env: string): string => {
      return normalizeSimple(env)
        .toLowerCase()
        .replace(/^(a|an|the)\s+/i, "")
        .trim();
    };

    const normalizeLighting = (text: string): string => {
      return normalizeSimple(text);
    };

    const sanitizePose = (pose: string): string => {
      if (!pose) return "";
      // remove leading "subject"
      return pose.replace(/^subject\s+/i, "");
    };

    const autoClean = (prompt: string) => {
      // LOCK FILENAMES (INTEGRITY GUARD)
      const { locked, files } = lockFileTokens(prompt);
      let cleaned = locked;

      cleaned = cleaned
        .replace(/\b(man|woman|person|human)\b/gi, "subject")
        .replace(/original\s+original/gi, "original")
        .replace(/maintain\s+preserve/gi, "maintain")
        .replace(/pose\s+pose/gi, "pose")
        .replace(/\s+/g, " ")
        .trim();
      
      // Fix broken extensions in non-locked text if any
      cleaned = cleaned.replace(/\.\s+(jpg|jpeg|png|webp|gif|bmp|tiff)\b/gi, ".$1");

      const sentences = cleaned.split(". ");
      let fromCount = 0;
      const filteredSentences = sentences.filter(s => {
        const lower = s.toLowerCase();
        if (lower.includes("from")) {
          if (fromCount >= 2) return false;
          fromCount++;
        }
        return true;
      });

      cleaned = filteredSentences.join(". ");
      cleaned = cleanDots(removeDuplicateWords(cleaned));
      if (!cleaned.endsWith(".")) cleaned += ".";

      // RESTORE FILENAMES
      return restoreFileTokens(cleaned, files);
    };

    // ────────────────────────────────────────────────────────
    // 🔒 COMMAND — ENGINE PROTECTION PROTOCOL V1
    // 🛡️ CORE IMMUTABILITY SYSTEM (ABSOLUTE LOCK)
    // ────────────────────────────────────────────────────────
    // STATUS: V5.5.1 GOLD MASTER (HOTFIX) — OUTPUT ISOLATION LOCK
    // ────────────────────────────────────────────────────────

    // ========================================
    // OUTPUT ISOLATION LOCK — V5.5.1
    // ========================================
    const isCommandBlock = (text: string): boolean => {
      return /COMMAND —|SYSTEM MODE|SYSTEM REJECTED|PASS 1|EXECUTION RULE/i.test(text);
    };

    const isolateOutputs = (
      simulationText: string,
      finalPrompt: string,
      negativePrompt: string
    ) => {
      // 🛑 HARD VALIDATION 1
      if (isCommandBlock(simulationText)) {
        throw new Error("V5.5.1 FATAL: Visual Simulation contaminated by command block");
      }

      // 🛑 HARD VALIDATION 2
      if (!isCommandBlock(finalPrompt)) {
        throw new Error("V5.5.1 FATAL: Master Prompt missing command structure");
      }

      // 🛑 HARD VALIDATION 3 (ANTI DOUBLE SOURCE)
      if (simulationText.trim() === finalPrompt.trim()) {
        throw new Error("V5.5.1 FATAL: Output duplication detected");
      }

      // ✅ FINAL LOCK (IMMUTABLE RETURN)
      return Object.freeze({
        visualSimulation: simulationText.trim(),
        masterExecutionPrompt: finalPrompt.trim(),
        negativePrompt: negativePrompt.trim()
      });
    };

    // ==================================================
    // # COMMAND — PATCH V5.6.1B (CONTROLLED REALISM INSERTION — STRICT LOCK)
    // ==================================================
    // ======================================
    // VISUAL OUTPUT OVERRIDE REMOVAL V1.0
    // CRITICAL SAFE
    // ======================================
    function safeReturn(text: string): string {
      if (!text || text.trim().length === 0) {
        return text; // biarkan kosong, jangan inject
      }
      return text;
    }

    function safeJoin(parts: string[]): string {
      return parts
        .filter(Boolean)
        .map(p => p.trim())
        .filter((p, i, arr) => arr.indexOf(p) === i)
        .join(", ");
    }

    function removeWordDuplication(text: string): string {
      return text.replace(/\b(\w+)\s+\1\b/gi, "$1");
    }

    function fixArticles(text: string): string {
      return text.replace(/\ba ([aeiou])/gi, "an $1");
    }

    function removeNearDuplicate(parts: string[]): string[] {
      const seen = new Set();
      return parts.filter(p => {
        if (!p) return false;
        const key = p
          .toLowerCase()
          .replace(/diffused|soft|subtle/g, "")
          .trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function cleanBrokenTail(text: string): string {
      return text.replace(/(creating and a|and and|,\s*$)/gi, "").replace(/\.\s+\./g, ".");
    }

    function fixSentenceCase(text: string): string {
      return text.replace(/(^\w|\.\s+\w)/g, c => c.toUpperCase());
    }

    function removeFragments(text: string): string {
      return text.replace(/\b(perspective)\.\s*/gi, "");
    }

    function fixMissingSubject(text: string): string {
      return text.replace(
        /(\.\s*)(wearing)/gi,
        "$1They are wearing"
      );
    }

    function fixVisualSentenceFlow(text: string): string {
      return text
        .replace(/shot The scene/gi, "shot. The scene")
        .replace(/\s+/g, " ")
        .trim();
    }

    function dedupeCommaList(text: string): string {
      const parts = text.split(",").map(s => s.trim().toLowerCase());
      return [...new Set(parts.filter(Boolean))].join(", ");
    }

    function improveSentenceFlow(text: string): string {
      return text
        .replace(/with ([^,]+) with/gi, "with $1, with")
        .replace(/while ([^,]+) with/gi, "while $1, with")
        .replace(/\s+,/g, ",")
        .replace(/\s+/g, " ")
        .trim();
    }

    const buildVisualSimulationNormalized = (config: any) => {
      const {
        environment,
        lighting,
        angle,
        outfitDescription,
        pose
      } = config;

      const cleanEnv = normalizeEnvironment(environment);
      const cleanLighting = normalizeLighting(lighting);

      // 🔴 JANGAN HARD-CODE "a" atau "an"
      const article = smartArticle(cleanEnv);
      const subjectIntro = `A realistic photo of a person in ${article} ${cleanEnv}`;

      const cleanPose = sanitizePose(pose);

      // 🔴 MICRO TENSION LOCALIZATION V1.0
      const weightDir = cleanPose.toLowerCase().includes('lean') ? 'slightly forward' : 
                        cleanPose.toLowerCase().includes('sit') ? 'evenly balanced' : 'slightly to one side';
      
      const tensionDetail = (cleanPose.toLowerCase().includes('hand') || cleanPose.toLowerCase().includes('arm')) 
        ? `subtle tension in the dominant shoulder and wrist of the raised arm`
        : (cleanPose.toLowerCase().includes('look') || cleanPose.toLowerCase().includes('head'))
        ? `slight tension in the neck and rotation side, with relaxed balance in the torso`
        : `subtle tension in the dominant shoulder and torso, with relaxed balance in the lower body`;

      const poseDetail = `with weight shifted slightly to one side, ${tensionDetail}`;

      const poseLine = cleanPose
        ? `the subject is ${cleanPose} ${poseDetail}, integrated naturally into the environmental context`
        : `the subject is naturally positioned within the scene with realistic physical grounding, showing ${poseDetail}`;

      const outfitLine = `wearing ${outfitDescription}, which fits naturally with the overall setting`;

      const cameraLine = `captured from an ${angle.toLowerCase()} medium shot with natural perspective and mild depth separation`;

      // 🔴 VISUAL SIMULATION ENHANCER V1.0
      const primaryLight = cleanLighting.toLowerCase().includes('neon') ? 'neon ambient glow' : 
                          cleanLighting.toLowerCase().includes('studio') ? 'studio lighting' :
                          cleanLighting.toLowerCase().includes('flash') ? 'artificial flash' :
                          cleanLighting.toLowerCase().includes('sun') ? 'natural sunlight' : 'environmental lighting';
      
      const secondaryEffect = cleanLighting.toLowerCase().includes('neon') ? 'subtle magenta and cyan spill' :
                             cleanLighting.toLowerCase().includes('warm') ? 'warm tonal highlights' :
                             cleanLighting.toLowerCase().includes('soft') ? 'diffused shadows' : 'realistic color interaction';

      const lightingLine = `The scene is illuminated by ${primaryLight} with ${secondaryEffect}, creating natural depth and contrast`;

      let parts = [
        subjectIntro,
        poseLine,
        outfitLine,
        cameraLine,
        lightingLine
      ];

      // 🔴 SEMANTIC DEDUPE
      parts = removeNearDuplicate(parts);

      // 🔴 NARRATIVE FLOW
      let finalText = parts
        .map(p => p.trim())
        .map(p => p.endsWith('.') ? p : p + '.')
        .join(" ");

      // 🔴 FINAL CLEAN PIPELINE
      finalText = removeWordDuplication(finalText);
      finalText = fixArticles(finalText);
      finalText = cleanBrokenTail(finalText);

      // 🔴 FINAL POLISH
      finalText = removeFragments(finalText);
      finalText = fixMissingSubject(finalText);
      finalText = fixSentenceCase(finalText);
      finalText = fixVisualSentenceFlow(finalText);
      finalText = improveSentenceFlow(finalText);

      // 🔴 FINAL NORMALIZATION STACK (V5.7.0 GOLD MASTER)
      finalText = normalizeNarrative(finalText);

      return finalText;
    };

    const buildNanoPrompt = (pData: any) => {
      // ────────────────────────────────────────────────────────
      // 🧩 [PROMPT GENERATOR V7.0.0 — FINAL MASTER COMMAND (HARD LOCK)]
      // ────────────────────────────────────────────────────────

      // --- [STAGE 0: CONFLICT REJECTION & PURITY LOCK] ---
      const originalMode = pData.poseMode;
      const isManualAnatomy = pData.isManual;
      
      // Force Purity
      if (pData.poseMode === "AUTO") pData.poseMode = "FREE";
      
      const mode = pData.poseMode || "FREE";
      const preset = pData.envPreset || "STREET";
      const atmos = pData.atmosPreset || "NONE";

      // 🚨 CONFLICT REJECTION GATES
      if (originalMode === "AUTO" && isManualAnatomy) {
          return {
              visualSimulation: "REJECTED: Conflict detected (AUTO MODE + MANUAL ANATOMY)",
              masterExecutionPrompt: "SYSTEM REJECTED: Conflict detected (AUTO MODE + MANUAL ANATOMY). Geometry purity cannot be guaranteed.",
              negativePrompt: "REJECTED"
          };
      }

      let physiqueCue = "";
      if (pData.anatomy) {
        if (pData.isManual) {
          const prof = pData.anatomy;
          const h = (prof.visualHeight || "medium").replace("average", "medium");
          const b = normalizeAnatomyTerms(prof.buildType || "athletic").toLowerCase();
          physiqueCue = ` and ${h} ${b} physique`;
        } else {
          physiqueCue = ` and ${buildPhysiqueProfile(pData.anatomy)}`;
        }
      }

      let multiSubjectLock = "";
      let multiSubjectNegative = "";
      if (pData.isMultiSubject && pData.targetSubjectRole) {
        multiSubjectLock = [
          `## MULTI-SUBJECT ISOLATION LOCK`,
          `CRITICAL: The MAIN_SCENE contains multiple people. ONLY REPLACE: "${pData.targetSubjectRole}".`,
          `* ABSOLUTE IMMUTABILITY: All other persons in the scene MUST remain exactly as they appear in the original source image.`,
          `* NO IDENTITY BLEED: Do not transfer features, skin tone, or styling to bystanders.`,
          `* BYSTANDER PRESERVATION: Consider non-target subjects as sacred environmental background data.`,
          ``
        ].join("\n");
        multiSubjectNegative = "altering secondary subjects, replacing wrong person, merging identities, changing bystander faces, mutating friends, modifying background people, ";
      }

      const masterPrompt = [
        `# RENDERING INSTRUCTIONS (V8.0)`,
        ``,
        `## 1. SOURCE & TARGET`,
        `SCENE: ${pData.main}`,
        `SUBJECT: ${pData.ref}`,
        pData.outfit ? `OUTFIT: ${pData.outfit}` : `OUTFIT: PRESERVE MAIN SCENE CLOTHING`,
        `MODE: ${mode}`,
        ``,
        multiSubjectLock ? multiSubjectLock : "",
        `## 2. SUBJECT GENERATION`,
        cleanExpression ? `EXPRESSION: ${cleanExpression}` : "",
        cleanFaceShape ? `FACE_SHAPE: ${cleanFaceShape}` : "",
        cleanHair ? `HAIR: ${cleanHair}` : "",
        nanoTrigger ? `- Subject directive: ${nanoTrigger}` : "",
        ``,
        `## 3. ENVIRONMENT & UNIFICATION`,
        `* Match SCENE lighting (direction, temperature), shadows, and atmospheric depth.`,
        `* Ensure consistent sensor behavior, black levels, and lens response across the frame.`,
        `* Environment composition must remain IDENTICAL to MAIN_SCENE.`,
        `* Maintain pixel-perfect consistency for all background architectural and environmental elements.`,
        `* Apply natural edge diffusion and ambient occlusion for subject integration.`,
        ``,
        buildSceneImmutabilityLock(),
        ``,
        `## 4. VALIDATION`,
        `- ${buildAnatomyLightingWrap(pData.anatomy)}`,
        `- ${buildAdaptiveSSSPatch(pData.lighting, pData.skin_tone)}`,
        `- ${buildAtmosphericDepthPatch(pData.environment)}`,
        `- ${buildCameraLensFidelityPatch(pData.camera)}`,
        ``,
        `## OUTPUT`,
        `Final output must appear as a naturally photographed scene with unified lighting, realistic body presence, grounded environmental interaction, and consistent camera rendering across the frame.`
      ].filter(line => line !== "").join("\n");

      const strategyLock = [
        `EXECUTION STRATEGY & LOCK`,
        ``,
        `POSE CONTROL ENGINE: ${mode.toUpperCase()}`,
        `ANATOMY AUTHORITY: ${pData.isManual ? "MANUAL" : "AUTO"}`,
        `SUBJECT INTEGRITY: ACTIVE (SUBJECT PURGE ENABLED)`,
        ``,
        `VISUAL SIMULATION`
      ];

      const simulationLines = [
        ...strategyLock,
        `[SCENE CAPTURE V8.0]`,
        `STATUS: Environment recorded naturally.`,
        `CAPTURE: Capturing a naturally composed environment with coherent subject presence.`,
        pData.isMultiSubject ? `ISOLATION: Multi-Subject Mode. Target: ${pData.targetSubjectRole}` : `ISOLATION: Single Subject Focus.`,
        `ANATOMY: ${pData.isManual ? "MANUAL OVERRIDE" : "TARGET INFERRED"} [${physiqueCue.trim() || "Standard"}].`,
        `POSE: Executing [${mode}] protocol. Perspective aligned.`,
        `INTEGRATION: Grounding subject using depth-aware lighting from SCENE.`,
        ``,
        `SCENE INTELLIGENCE`,
        ``,
        `Lighting: ${pData.lighting || "ambient lighting"}`,
        `Camera Target: ${pData.angle || "medium shot"}`,
        `Environment: ${pData.env || "dimly lit scene"}`,
        `Anatomy Ref: ${pData.attributes || "Standard anatomy"}`
      ];

      return {
        visualSimulation: simulationLines.join("\n"),
        masterExecutionPrompt: masterPrompt,
        negativePrompt: [
          multiSubjectNegative,
          "photorealistic, consistency_lock, deterministic, anatomically_correct,",
          "natural_lighting, seamless_integration, high_fidelity_texture,",
          "original face structure, scene-person anatomy, scene-person skin tone, scene-person tattoos,",
          "scene-person biological traits, human preservation bias, identity contamination, face merge,",
          "facial blending, body inheritance, waxy skin, plastic skin, over-smoothed skin,",
          "airbrushed skin, unrealistic skin texture, original_silhouette, ghosting, shadow_residue,",
          "face_swap, anatomical_drift, creative_interpolation, proportional_variation, low_resolution, artifacts"
        ].filter(Boolean).join(" ").replace(/\s+/g, " ")
      };
    };

    const promptData = {
      main: generateEmptyScene(validateAndCleanFilename(mainFileName)),
      ref: validateAndCleanFilename(replacementFileName),
      pose: sanitize(pose || ""),
      outfit: outfitImage ? validateAndCleanFilename(outfitFileName) : "",
      lighting: sanitize(data?.analysis?.lighting || lighting_type || color_tones || ""),
      env: data?.analysis?.environment || "",
      angle: data?.analysis?.angle || "Eye Level",
      poseMode: poseMode,
      envPreset: envPreset,
      atmosPreset: atmosPreset,
      skinTone: data?.prompts?.skin_tone || "",
      expression: cleanExpression,
      face_shape: cleanFaceShape,
      hair: cleanHair,
      isManual: !!anatomyProfile,
      isMultiSubject: isMultiSubject,
      targetSubjectRole: targetSubjectRole,
      anatomy: (() => {
        if (anatomyProfile) return anatomyProfile;
        const auto = inferAnatomyProfile(buildAutoSubjectAttributes(pose || "", data?.analysis?.environment || "", data?.analysis?.lighting || lighting_type || color_tones || "", poseMode, data?.prompts?.skin_tone, anatomyProfile, { face_shape: cleanFaceShape, hair: cleanHair, expression: cleanExpression }));
        return normalizeAutoAnatomyProfile(auto);
      })(),
      attributes: buildAutoSubjectAttributes(pose || "", data?.analysis?.environment || "", data?.analysis?.lighting || lighting_type || color_tones || "", poseMode, data?.prompts?.skin_tone, anatomyProfile, { face_shape: cleanFaceShape, hair: cleanHair, expression: cleanExpression })
    };

    // ======================================
    // TWO-STAGE PIPELINE (PHASE B - CRITICAL)
    // ======================================

    // PHASE S6 — SUBJECT COVERAGE ANALYZER
    let coverageResult = await analyzeSubjectCoverage(replacementDetection);

    const effectiveCoverageOverride = options?.coverageOverride || contextCoverageOverride;
    if (coverageResult.coverage === "NOT_DETECTED") {
      if (effectiveCoverageOverride) {
        coverageResult = effectiveCoverageOverride;
      } else if (!replacementDetection) {
        // Fallback for old history entries where detection wasn't saved
        coverageResult = { coverage: 'HALF_BODY', logic: 'Fallback due to missing history detection context.' };
      } else {
        throw new Error(
          "SUBJECT not detected in reference image. Please provide a clear photograph of the subject."
        );
      }
    }

    // PHASE D21 — SINGLE REFERENCE FUSION SYSTEM
    // PHASE D22 — BODY PROPORTION LOCK
    // Maps the identity source to a fused biological identity context.
    const identityTraitsParts: string[] = [];
    if (cleanExpression) identityTraitsParts.push(`expression: ${cleanExpression}`);
    if (cleanFaceShape) identityTraitsParts.push(`face shape: ${cleanFaceShape}`);
    if (cleanHair) identityTraitsParts.push(`hair: ${cleanHair}`);
    if (nanoTrigger) identityTraitsParts.push(`directive: ${nanoTrigger}`);
    
    const subjectIdentityDescriptor = identityTraitsParts.length > 0
      ? `IDENTITY_SHEET_FUSION(${validateAndCleanFilename(replacementFileName)})\n- Identity traits: ${identityTraitsParts.join(", ")}`
      : `IDENTITY_SHEET_FUSION(${validateAndCleanFilename(replacementFileName)})`;

    const finalPipelinePrompt = await buildSubjectGeneration(
      subjectIdentityDescriptor,
      buildAnatomyAuthority(promptData.anatomy, promptData.isManual),
      coverageResult,
      promptData.outfit,
      { enabled: promptData.isMultiSubject, targetRole: promptData.targetSubjectRole },
      {
        poseMode: promptData.poseMode || "FREE",
        isManual: promptData.isManual || false,
        envPreset: promptData.envPreset || "AUTO",
        atmosPreset: promptData.atmosPreset || "NONE"
      }
    );

    // ======================================
    // PROMPT GENERATOR V9.0.0 — MINIMAL RESET
    // ======================================

    // STEP 1 — CLEAN ASSEMBLY
    let finalPrompt = finalPipelinePrompt;

    finalPrompt = cleanDoubleDots(finalPrompt);
    finalPrompt = fixAttributePunctuation(finalPrompt);
    finalPrompt = fixSentenceCapitalization(finalPrompt);
    finalPrompt = sanitizePromptStructure(finalPrompt);
    finalPrompt = stabilizePromptStructure(finalPrompt);
    finalPrompt = fixPunctuationFlow(finalPrompt);
    finalPrompt = cleanSentence(finalPrompt);

    // STEP 3.5 — SCENE IMMUTABILITY LOCK (PHASE D50)
    finalPrompt += "\n\n" + buildSceneImmutabilityLock();

    // STEP 4 — CORE LOCK (V9 MINIMAL ARCHITECTURE)
    const visualSimulation = buildNanoPrompt(promptData).visualSimulation;
    
    // --- V9 MINIMAL NEGATIVE ---
    const FINAL_NEGATIVE_PROMPT_V5 = "inherited jawline, scene face shape, inherited cheekbones, missing glasses, wrong glasses, changed hairstyle, face swap, floating head, detached neck, mismatched skin tone, visible neck seam, head-body lighting mismatch, identity blending, generic ai face, plastic skin, cutout edges, cloned pose, inherited clothing, inherited body shape, inherited accessories, scene body continuation, watermark, signature, text, logo, tattoos";
    
    let masterNegative = FINAL_NEGATIVE_PROMPT_V5;
    if (promptData.isMultiSubject) {
      masterNegative = "altering secondary subjects, replacing wrong person, merging identities, changing bystander faces, mutating friends, modifying background people, " + masterNegative;
    }

    // --- FINAL ASSEMBLY ---
    const masterExecutionPrompt = finalPrompt.trim();

    // 🔒 GUARD: Absolute Immutability
    Object.freeze(visualSimulation);
    Object.freeze(masterExecutionPrompt);

    // STEP 5 — VALIDATION (ANTI-CORRUPTION)
    // Rule V5.5.1: visualSimulation MUST NOT be equal to masterExecutionPrompt
    if (visualSimulation.trim() === masterExecutionPrompt.trim()) {
      throw new Error("V5.5.1 FATAL: Output duplication detected (Desync)");
    }

    return {
      nano: {
        basic: masterExecutionPrompt,
        advanced: masterExecutionPrompt,
        expert: masterExecutionPrompt,
        negative: masterNegative
      },
      simulation: visualSimulation, // NATURALLY ISOLATED
      cleanedScene: cleanedScene
    };
    // --- END OF STABLE LOGIC ---
  }
};
// 🔒 [END OF STABLE ZONE: NANO BANANA ENGINE]

// ===============================
// INPUT NORMALIZATION PIPELINE V1
// ===============================

// guard validasi keras sebelum engine jalan
export function assertValidImage(input: string) {
  if (
    !input.startsWith("http") &&
    !input.startsWith("https") &&
    !input.startsWith("data:image")
  ) {
    throw new Error(
      "INVALID IMAGE SOURCE: MUST BE URL OR BASE64 ONLY"
    );
  }
}

// --- Universal Image Input Engine ---

interface Asset {
  src: string;
  type: "image";
  origin: "upload" | "url";
}

function validateURL(url: string) {
  if (!url.startsWith("http")) throw "INVALID_URL";
}

async function resolveImageURL(url: string): Promise<string | null> {
  // case data URI
  if (url.startsWith("data:image")) return url;
  
  // direct image
  if (url.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)) return url;

  try {
    const response = await fetch("/api/resolve-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) throw new Error("Proxy failed");
    
    const data = await response.json();
    return data.imageUrl || null;
  } catch (e) {
    console.warn("Proxy Resolve Error, trying client fallback:", e);
    // client fallback (might fail due to CORS)
    try {
      const response = await fetch(url);
      const html = await response.text();
      const match = html.match(/property="og:image" content="([^"]+)"/) || html.match(/name="og:image" content="([^"]+)"/);
      return match?.[1] || null;
    } catch (innerE) {
      return null;
    }
  }
}

async function handleInput(input: File | string): Promise<Asset> {
  let srcToNormalize = input;

  if (typeof input === "string") {
    // If it's a generic web page URL, resolve to an actual valid image URL first
    if (input.startsWith("http") && !input.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)) {
       const resolved = await resolveImageURL(input);
       if (!resolved) throw "FAILED_TO_RESOLVE_IMAGE";
       srcToNormalize = resolved;
    }
  }

  const normalized = await normalizeImageInput(srcToNormalize);
  assertValidImage(normalized);

  return {
    src: normalized,
    type: "image",
    origin: typeof input === "string" ? "url" : "upload"
  };
}

// --- Components ---

const ImageUpload = ({ 
  label, 
  image, 
  onUpload, 
  id,
  detection,
  isDetecting: parentIsDetecting,
  cutout,
  isMasking: parentIsMasking,
  depth,
  isDepth: parentIsDepth,
  pose,
  isPosing: parentIsPosing,
  dynamicAspect = false,
  onClear
}: { 
  label: string; 
  image: string | null; 
  onUpload: (src: string, fileName: string) => void;
  id: string;
  detection?: DetectionResult | null;
  isDetecting?: boolean;
  cutout?: string | null;
  isMasking?: boolean;
  depth?: DepthResult | null;
  isDepth?: boolean;
  pose?: PoseResult | null;
  isPosing?: boolean;
  dynamicAspect?: boolean;
  onClear?: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [showCutout, setShowCutout] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (image && dynamicAspect) {
      const img = new Image();
      img.onload = () => {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      };
      img.src = image;
    } else {
      setAspectRatio(null);
    }
  }, [image, dynamicAspect]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const asset = await handleInput(file);
        onUpload(asset.src, file.name);
        setIngestError(null);
      } catch (err) {
        setIngestError("File access error");
      }
    }
  };

  const handleUrlIngest = async () => {
    if (!urlInput.trim()) return;
    setIsIngesting(true);
    setIngestError(null);
    try {
      const asset = await handleInput(urlInput.trim());
      const fileName = urlInput.split('/').pop()?.split('?')[0] || "external_image.jpg";
      onUpload(asset.src, fileName);
      setUrlInput("");
    } catch (err) {
      setIngestError(err === "INVALID_URL" ? "Invalid URL" : "No image found");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="label-micro ml-1 flex justify-between items-center">
        {label}
        {ingestError && <span className="text-[10px] text-red-500 font-medium animate-pulse">{ingestError}</span>}
      </label>
      
      <div className="group relative">
        <div 
          onClick={() => !image && fileInputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center gap-3
            ${image ? 'border-brand-500 bg-brand-50/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50 cursor-pointer aspect-square'}
            ${!image && !dynamicAspect ? 'aspect-square' : ''}`}
          style={image && aspectRatio ? { aspectRatio: `${aspectRatio}` } : (image && !dynamicAspect ? { aspectRatio: '1/1' } : {})}
        >
          {image ? (
            <>
              <img 
                src={showCutout && cutout ? cutout : image} 
                alt={label} 
                className={`w-full h-full object-cover transition-all duration-500 ${showCutout ? 'scale-110 drop-shadow-2xl' : ''}`}
                referrerPolicy="no-referrer"
              />
              
              {/* Always-accessible Quick Remove Button (top-right) */}
              {onClear && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    onClear();
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white transition-all z-30 shadow-md backdrop-blur-xs"
                  title="Remove image"
                  aria-label={`Remove ${label}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Grid background for cutout mode */}
              {showCutout && (
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-20"></div>
              )}
              
              {/* Detection Bounding Box Overlay */}
              {detection?.primary && !showCutout && (
                <div 
                  className="absolute border-2 border-brand-500 shadow-[0_0_10px_rgba(var(--brand-500-rgb),0.5)] pointer-events-none"
                  style={{
                    top: `${detection.primary.bbox.y / 10}%`,
                    left: `${detection.primary.bbox.x / 10}%`,
                    width: `${detection.primary.bbox.w / 10}%`,
                    height: `${detection.primary.bbox.h / 10}%`
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-brand-500 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                    <Target className="w-2 h-2" />
                    {detection.primary.type === 'face' ? 'Face detected' : 'Subject detected'}
                  </div>
                </div>
              )}

              {/* Pose Skeleton Overlay */}
              {pose && !showCutout && (
                <svg 
                  className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                >
                  {/* Edges */}
                  {pose.skeleton.map(([from, to], i) => {
                    const start = pose.keypoints.find(k => k.name === from);
                    const end = pose.keypoints.find(k => k.name === to);
                    if (start && end && start.score > 0.3 && end.score > 0.3) {
                      return (
                        <line 
                          key={`edge-${i}`}
                          x1={start.x} y1={start.y}
                          x2={end.x} y2={end.y}
                          stroke="#10b981"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                      );
                    }
                    return null;
                  })}
                  {/* Joints */}
                  {pose.keypoints.map((kp, i) => (
                    kp.score > 0.3 && (
                      <circle 
                        key={`kp-${i}`}
                        cx={kp.x} cy={kp.y} r="12"
                        fill="#10b981"
                        stroke="white"
                        strokeWidth="4"
                      />
                    )
                  ))}
                </svg>
              )}

              {(parentIsDetecting || parentIsMasking || parentIsDepth || parentIsPosing) && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <Zap className="w-3 h-3 text-white animate-pulse" />
                    </div>
                  </div>
                  <span className="text-white text-[9px] font-bold tracking-[0.3em] uppercase text-center px-4">
                    {parentIsMasking ? 'Segmenting...' : 
                     parentIsDepth ? 'Analyzing Depth...' : 
                     parentIsPosing ? 'Reading Pose...' : 
                     'Detecting...'}
                  </span>
                </div>
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="px-3 py-1.5 bg-white rounded-lg text-slate-800 text-xs font-semibold shadow-xl hover:scale-105 transition-transform flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Replace
                </button>
                {onClear && (
                  <button 
                    type="button"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      onClear(); 
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xl hover:scale-105 transition-transform flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-full bg-slate-100 text-slate-400 group-hover:bg-brand-100 group-hover:text-brand-500 transition-colors">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-center px-4">
                <p className="text-sm font-medium text-slate-600">Click to upload</p>
                <p className="text-xs text-slate-400 mt-1 uppercase tracking-tighter">or use URL below</p>
              </div>
            </>
          )}
          <input 
            type="file" 
            id={id}
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Action Layer (Preview/Crop info) */}
        {image && (
          <div className="mt-2 flex items-center gap-2 px-1">
            {cutout ? (
              <button 
                onClick={() => setShowCutout(!showCutout)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-all border
                  ${showCutout 
                    ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-brand-400'}`}
              >
                {showCutout ? <EyeOff className="w-3 h-3" /> : <Scissors className="w-3 h-3" />}
                {showCutout ? 'Hide Mask' : 'Preview Cutout'}
              </button>
            ) : detection?.primary && (
               <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium h-6">
                <UserCheck className="w-3 h-3 text-brand-500" />
                Auto-aligned
              </div>
            )}
            <div className="flex-1"></div>
            {depth && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200" title="Scene-level spatial depth estimation (subject/ground/horizon), NOT per-pixel depth measurement">
                <Box className="w-2.5 h-2.5 text-blue-500" />
                Est. Scene Depth: {Math.round(depth.subjectDepth * 100) / 100}
              </div>
            )}
            {detection?.primary && (
              <div className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold border border-slate-200">
                Confidence: {detection.primary.confidence !== null && detection.primary.confidence !== undefined ? `${Math.round(detection.primary.confidence * 100)}%` : 'n/a'}
              </div>
            )}
          </div>
        )}

        {/* URL Input Layer */}
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <input 
              type="text"
              placeholder="Paste image URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlIngest()}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-all outline-none bg-slate-50/50"
            />
            <Link className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <button 
            onClick={handleUrlIngest}
            disabled={isIngesting || !urlInput.trim()}
            className="p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center min-w-[36px]"
          >
            {isIngesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};



type PoseMode = "LOCKED" | "BLEND" | "FREE" | "AUTO";
type EnvPreset = "CLUB" | "STREET" | "DAYLIGHT" | "STUDIO" | "AUTO";
type AtmosPreset = "NONE" | "FOG" | "RAIN" | "BACKLIGHT" | "AUTO";

function asString(val: any): string {
  return typeof val === "string" 
    ? val 
    : (val === null || val === undefined 
        ? "" 
        : (typeof val === "object" 
            ? (val.text || val.description || val.content || val.value || JSON.stringify(val))
            : String(val)));
}


// --- PIPELINE FINALIZATION LAYER (TAHAP 5-1) ---
export interface FinalizePipelineContext {
  mainDetection: DetectionResult | null;
  replacementDetection: DetectionResult | null;
  mainPose: PoseResult | null;
  replacementPose: PoseResult | null;
  mainFileName: string;
  replacementFileName: string;
  outfitFileName: string;
  outfitImage: string | null;
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
  chatTrigger?: string;
}

export async function runFinalizePipeline(
  reconciliation: any, // ReconciledAnalysisResult
  ctx: FinalizePipelineContext
): Promise<GenerationResult> {
  const { data } = reconciliation;
  
  let simulationText = asString(data.simulation);
  if (!simulationText || isMetaInstruction(simulationText)) {
    simulationText = generateDeterministicSimulation(
      data.analysis,
      extractValidIdentityTraits(data.prompts),
      {
        pose: data.prompts?.pose,
        outfit: data.prompts?.outfit,
        framing: reconciliation.replacementCoverageOverride?.coverage
      }
    );
    console.log("[Simulation] Replaced empty/meta simulation with deterministic visual description.");
  }

  const sanitizedData: GenerationResult = {
    analysis: {
      lighting: data.analysis.lighting,
      angle: cleanAngle(asString(data.analysis?.angle)),
      environment: asString(data.analysis?.environment)
    },
    nano: { basic: "", advanced: "", expert: "", negative: "" },
    simulation: simulationText,
    subjectAttributes: ctx.attributes
  };

  sanitizedData.simulation = asString(sanitizedData.simulation).replace(/matching .*? lighting/i, "matching " + ctx.autoLightingStr + ", with accurate shadow direction and depth");

  const nanoResult = await (NANO_BANANA_ENGINE as any).process(reconciliation.data, {
    mainFileName: ctx.mainFileName,
    replacementFileName: ctx.replacementFileName,
    outfitImage: ctx.outfitImage,
    outfitFileName: ctx.outfitFileName,
    poseMode: ctx.targetPoseMode,
    envPreset: ctx.targetEnvPreset,
    atmosPreset: ctx.targetAtmosPreset,
    sanitize: ctx.sanitize,
    anatomyProfile: ctx.anatomyProfile,
    outputMode: 'nano',
    replacementDetection: ctx.replacementDetection,
    cleanedScene: ctx.cleanedScene,
    isMultiSubject: ctx.isMultiSubject,
    targetSubjectRole: ctx.targetSubjectRole,
    coverageOverride: reconciliation.replacementCoverageOverride,
    chatTrigger: ctx.chatTrigger
  });

  sanitizedData.nano = nanoResult.nano;
  sanitizedData.simulation = nanoResult.simulation;
  if (!sanitizedData.simulation || isMetaInstruction(sanitizedData.simulation)) {
    sanitizedData.simulation = simulationText;
  }
  sanitizedData.cleanedScene = ctx.reconstructedScene;

  const sanitizerCtx: SanitizerContext = {
    structuredAngle: asString(data.analysis?.angle),
    structuredFraming: reconciliation?.replacementCoverageOverride?.coverage || (ctx.replacementDetection ? "FULL_BODY" : undefined),
    structuredLightingQuality: asString(data.analysis?.lighting),
    structuredColorTone: asString(data.prompts?.color_tones || data.analysis?.lighting),
    isMixedLighting: /mixed/i.test(asString(data.analysis?.lighting)) || /mixed/i.test(asString(data.prompts?.color_tones))
  };

  sanitizedData.nano.basic = sanitizePromptConflicts(sanitizeFinalOutput(sanitizedData.nano.basic), sanitizerCtx, "nano").sanitizedPrompt;
  sanitizedData.nano.advanced = sanitizePromptConflicts(sanitizeFinalOutput(sanitizedData.nano.advanced), sanitizerCtx, "nano").sanitizedPrompt;
  sanitizedData.nano.expert = sanitizePromptConflicts(sanitizeFinalOutput(sanitizedData.nano.expert), sanitizerCtx, "nano").sanitizedPrompt;
  sanitizedData.simulation = sanitizeFinalOutput(sanitizedData.simulation);

  return sanitizedData;
}

export default function App() {
  const [mainImage, setMainImage] = useState<string | null>(null);
  const [mainFileName, setMainFileName] = useState<string>("");
  const [mainDetection, setMainDetection] = useState<DetectionResult | null>(null);
  const [mainCutout, setMainCutout] = useState<string | null>(null);
  const [mainDepth, setMainDepth] = useState<DepthResult | null>(null);
  const [mainPose, setMainPose] = useState<PoseResult | null>(null);
  const [isDetectingMain, setIsDetectingMain] = useState(false);
  const [isMaskingMain, setIsMaskingMain] = useState(false);
  const [isDepthMain, setIsDepthMain] = useState(false);
  const [isPosingMain, setIsPosingMain] = useState(false);

  const [replacementImage, setReplacementImage] = useState<string | null>(null);
  const [replacementFileName, setReplacementFileName] = useState<string>("");
  const [replacementDetection, setReplacementDetection] = useState<DetectionResult | null>(null);
  const [replacementCutout, setReplacementCutout] = useState<string | null>(null);
  const [replacementDepth, setReplacementDepth] = useState<DepthResult | null>(null);
  const [replacementPose, setReplacementPose] = useState<PoseResult | null>(null);
  const [isDetectingReplacement, setIsDetectingReplacement] = useState(false);
  const [isMaskingReplacement, setIsMaskingReplacement] = useState(false);
  const [isDepthReplacement, setIsDepthReplacement] = useState(false);
  const [isPosingReplacement, setIsPosingReplacement] = useState(false);

  const [outfitImage, setOutfitImage] = useState<string | null>(null);
  const [outfitFileName, setOutfitFileName] = useState<string>("");
  const [outfitDetection, setOutfitDetection] = useState<DetectionResult | null>(null);
  const [outfitCutout, setOutfitCutout] = useState<string | null>(null);
  const [outfitDepth, setOutfitDepth] = useState<DepthResult | null>(null);
  const [outfitPose, setOutfitPose] = useState<PoseResult | null>(null);
  const [isDetectingOutfit, setIsDetectingOutfit] = useState(false);
  const [isMaskingOutfit, setIsMaskingOutfit] = useState(false);
  const [isDepthOutfit, setIsDepthOutfit] = useState(false);
  const [isPosingOutfit, setIsPosingOutfit] = useState(false);
  
  const [style, setStyle] = useState<Style>('realistic');
  const [outputMode, setOutputMode] = useState<OutputMode>('nano');
  const [nanoVariant, setNanoVariant] = useState<NanoVariant>('expert');
  const [poseMode, setPoseMode] = useState<PoseMode>("AUTO");
  const [envPreset, setEnvPreset] = useState<EnvPreset>("AUTO");
  const [atmosPreset, setAtmosPreset] = useState<AtmosPreset>("AUTO");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anatomyAuthorityMode, setAnatomyAuthorityMode] = useState<"template" | "custom">("template");
  const [isMultiSubject, setIsMultiSubject] = useState(false);
  const [targetSubjectRole, setTargetSubjectRole] = useState("The person on the left");
  const [anatomyProfile, setAnatomyProfile] = useState<AnatomyProfile | null>(() => {
    const t = asianBodyProfiles.ready_templates[0];
    return {
      templateId: t.template_id,
      heightCm: (t.specifications as any).male?.height_cm || (t.specifications as any).female?.height_cm,
      weightKg: (t.specifications as any).male?.weight_kg || (t.specifications as any).female?.weight_kg,
      buildType: t.body_classification_default,
      bodyFrame: t.geometric_silhouette_default,
      physicalTraits: t.physical_traits || []
    };
  });

  const currentRequestIdRef = useRef(0);
  const mainVisionRequestIdRef = useRef(0);
  const replacementVisionRequestIdRef = useRef(0);
  const outfitVisionRequestIdRef = useRef(0);
  
  const regenerateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizedMainRef = useRef<string | null>(null);
  const resizedReplacementRef = useRef<string | null>(null);
  const resizedOutfitRef = useRef<string | null>(null);
  const lastProcessedImagesRef = useRef<{main: string | null, replacement: string | null, outfit: string | null}>({main: null, replacement: null, outfit: null});

  const [loadingMessage, setLoadingMessage] = useState("Analyzing...");
  const [queueWaitInfo, setQueueWaitInfo] = useState<{ seconds: number; cancel: () => void } | null>(null);
  const [universalPrompt, setUniversalPrompt] = useState<{ prompt: string; negative: string } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [chatTrigger, setChatTrigger] = useState("");
  const [humanNarrative, setHumanNarrative] = useState<string | null>(null);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [checkpointData, setCheckpointData] = useState<CheckpointData | null>(null);
  const [editedCheckpoint, setEditedCheckpoint] = useState<AIResponse | null>(null);

  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('prompt_history');
    return saved ? JSON.parse(saved) : [];
  });

  const saveToHistory = async (newResult: GenerationResult) => {
    try {
      // 🚀 optimization: resize images for history to save localStorage space
      // Using 512px as a balance between quality and size
      const mainThumb = mainImage ? await resizeImage(mainImage, 512) : null;
      const replacementThumb = replacementImage ? await resizeImage(replacementImage, 512) : null;
      const outfitThumb = outfitImage ? await resizeImage(outfitImage, 512) : null;

      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        style,
        outputMode,
        poseMode,
        envPreset,
        atmosPreset,
        anatomyAuthorityMode,
        isMultiSubject,
        targetSubjectRole,
        anatomyProfile,
        mainFileName,
        replacementFileName,
        outfitFileName,
        replacementDetection,
        result: newResult,
        mainImage: mainThumb,
        replacementImage: replacementThumb,
        outfitImage: outfitThumb
      };

      const updated = [entry, ...history].slice(0, 6); // Reduced from 10 to 6
      setHistory(updated);

      const save = (data: any[]) => {
        try {
          localStorage.setItem('prompt_history', JSON.stringify(data));
          return true;
        } catch (e) {
          return false;
        }
      };

      if (!save(updated)) {
        console.warn("Storage quota exceeded. Attempting to save without full images for older entries...");
        // Strategy 1: Remove images from entries starting from the oldest
        let currentData = [...updated];
        for (let i = currentData.length - 1; i >= 0; i--) {
          if (currentData[i].mainImage || currentData[i].replacementImage || currentData[i].outfitImage) {
            currentData[i] = { ...currentData[i], mainImage: null, replacementImage: null, outfitImage: null };
            if (save(currentData)) {
              setHistory(currentData);
              return;
            }
          }
        }
        
        // Strategy 2: More aggressive cropping of history
        const superSmall = updated.slice(0, 2);
        if (save(superSmall)) {
          setHistory(superSmall);
        } else {
          // Absolute fallback: Clear history
          localStorage.removeItem('prompt_history');
          setHistory([]);
        }
      }
    } catch (err) {
      console.error("Failed to save to history:", err);
    }
  };

  const compilePromptsFromCheckpoint = async () => {
    if (!checkpointData || !editedCheckpoint) return;

    try {
      setLoading(true);
      setLoadingMessage("Compiling final prompts...");
      setError(null);

      const reconciliation = {
        data: editedCheckpoint,
        replacementCoverageOverride: checkpointData.context.coverageOverride
      };

      const freshAttributes = buildAutoSubjectAttributes(
        editedCheckpoint.prompts?.pose || "",
        asString(editedCheckpoint.analysis?.environment),
        asString(editedCheckpoint.analysis?.lighting) || asString(editedCheckpoint.prompts?.lighting_type) || asString(editedCheckpoint.prompts?.color_tones),
        checkpointData.context.targetPoseMode,
        asString(editedCheckpoint.prompts?.skin_tone),
        checkpointData.context.anatomyProfile,
        {
          face_shape: editedCheckpoint.prompts?.face_shape,
          hair: editedCheckpoint.prompts?.hair,
          expression: editedCheckpoint.prompts?.expression
        }
      );

      const sanitizedData = await runFinalizePipeline(reconciliation, {
        ...checkpointData.context,
        attributes: freshAttributes
      } as any);

      // --- FINAL VALIDATION: FILE TOKEN ASSERTION V7 (Nano-Bypass Enabled) ---
      const { mainFileName, replacementFileName } = checkpointData.context;
      const assertFileTokens = (text: string, isNano = false) => {
        const trimmed = text.trim();
        if (isNano) return;
        if (!trimmed) throw new Error("CRITICAL: PROMPT IS EMPTY");
        const hasMainFile = trimmed.toLowerCase().includes(mainFileName.toLowerCase());
        const hasRefFile = trimmed.toLowerCase().includes(replacementFileName.toLowerCase());
        const hasGenerationIntent = trimmed.includes("Generate a person") || 
                                   trimmed.includes("reconstruct the subject") || 
                                   trimmed.includes("reconstruct the scene");
        const hasUnifiedIntent = trimmed.includes("[REFERENCE_SUBJECT:") && trimmed.includes("[MAIN_SCENE:");
        const hasRoleBlock = trimmed.includes("INPUT IMAGE ROLES:");
        
        if (!hasGenerationIntent && !hasUnifiedIntent && !hasRoleBlock && (!hasMainFile || !hasRefFile)) {
          throw new Error("CRITICAL: FILE TOKEN LOST DURING SANITIZATION");
        }
      };

      assertFileTokens(sanitizedData.nano.basic, true);
      assertFileTokens(sanitizedData.nano.advanced, true);
      assertFileTokens(sanitizedData.nano.expert, true);
      assertFileTokens(sanitizedData.simulation, true);

      const universalRes = buildUniversalPrompt(
        sanitizedData,
        editedCheckpoint,
        {
          style: checkpointData.context.targetStyle,
          chatTrigger: checkpointData.context.chatTrigger,
          isMultiSubject: checkpointData.context.isMultiSubject,
          targetSubjectRole: checkpointData.context.targetSubjectRole,
          subjectAttributes: freshAttributes
        }
      );

      setResult(sanitizedData);
      setUniversalPrompt(universalRes);
      void saveToHistory(sanitizedData);
      
      // Success: Clear checkpoint
      setCheckpointData(null);
      setEditedCheckpoint(null);
    } catch (err: any) {
      console.error("Compilation failed:", err);
      setError(`Compilation Error: ${err.message || "Failed to finalize prompts."}`);
      setUniversalPrompt(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelCheckpoint = () => {
    setCheckpointData(null);
    setEditedCheckpoint(null);
  };

  const generatePrompts = async (
    targetMode: OutputMode = outputMode, 
    targetPoseMode: PoseMode = poseMode, 
    targetEnvPreset: EnvPreset = envPreset, 
    targetAtmosPreset: AtmosPreset = atmosPreset, 
    targetStyle: Style = style,
    retryCount = 0
  ) => {
    // FIX 2: Cancel Previous Request (Anti Overlap)
    const requestId = ++currentRequestIdRef.current;

    // fix_file_404_handling_v1: Validate file existence BEFORE use
    if (!mainImage || !replacementImage) {
      setError("Critical Error: Source images are missing. Please upload both MAIN_IMAGE and REFERENCE_IMAGE before generating prompts.");
      return;
    }

    if (!mainFileName || !replacementFileName) {
      setError("File Error: Image filenames are missing. Please re-upload your images.");
      return;
    }

    // Check if data URLs are valid (basic check)
    if (!mainImage.startsWith('data:image/') && !mainImage.startsWith('blob:') && !mainImage.startsWith('http')) {
      setError("Data Error: Main image failed to load correctly. Please try uploading it again.");
      return;
    }
    if (!replacementImage.startsWith('data:image/') && !replacementImage.startsWith('blob:') && !replacementImage.startsWith('http')) {
      setError("Data Error: Reference image failed to load correctly. Please try uploading it again.");
      return;
    }

    setLoading(true);
    setLoadingMessage(retryCount > 0 ? "Retrying analysis (Attempt 2/2)..." : "Analyzing...");
    setError(null);
    setGeneratedImage(null);
    setUniversalPrompt(null);

    setLoadingMessage("Initializing analysis pipeline...");

    // Timeout logic (Increased to 180s)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("The analysis is taking longer than expected due to network congestion or complex image processing. Please try again or use smaller images.")), 180000)
    );

    try {
      console.time(`generatePrompts_${requestId}`);
      
      // 1. Prepare Base64 parts (Images are already normalized to 1024px on upload)
      const extractB64 = (data: string | null) => data && data.includes('base64,') ? data.split('base64,')[1] : null;
      
      const mainBase64 = extractB64(mainImage) || "";
      const replacementBase64 = extractB64(replacementImage) || "";
      const outfitBase64 = extractB64(outfitImage) || "";

      // --- PHASE D44: TRUE HUMAN SILHOUETTE PRE-CLEAN (CRITICAL SAFE) ---
      setLoadingMessage("Pre-cleaning scene human silhouette...");
      const actualHumanCount = mainDetection?.primary 
        ? 1 + (mainDetection.secondary?.length || 0) 
        : 0;
      const { cleanedScene } = await buildTrueHumanSilhouettePreClean(mainImage || "", actualHumanCount);
      
      // --- PHASE D45: PHYSICAL EMPTY SCENE RECONSTRUCTION (CRITICAL SAFE) ---
      setLoadingMessage("Reconstructing empty background scene...");
      const { reconstructedScene } = await buildPhysicalEmptySceneReconstruction(cleanedScene);
      const reconstructedMainBase64 = extractB64(reconstructedScene) || mainBase64;

      if (!mainBase64 || !replacementBase64) {
        throw new Error("Source image data is missing or invalid.");
      }

      // 2. Mode Instructions
      const modeInstructions = NANO_BANANA_CONFIG.INSTRUCTIONS;

      // 3. STRICT ROLE INSTRUCTION
      let multiSubjectModifier = "";
      if (isMultiSubject && targetSubjectRole) {
        multiSubjectModifier = `
        ⚡ MULTI-SUBJECT ISOLATION ENABLED ⚡
        - The MAIN_IMAGE contains multiple people. You MUST ONLY isolate and replace the following specific target: "${targetSubjectRole}".
        - The other individuals in the scene are an immutable part of the background/scene environment.
        - Analyze the pose, lighting, and placement strictly for the specified TARGET person.
        - Ensure your generated constraints dictate that the other persons remain completely unedited.
        `;
      }

      let chatTriggerModifier = "";
      if (chatTrigger && chatTrigger.trim()) {
        const translatedTokens = translateChatTrigger(chatTrigger.trim());
        const semanticTokensStr = translatedTokens.join(", ");
        chatTriggerModifier = `
        ⚡ USER SPECIAL DIRECTIVE (CHAT TRIGGER) ⚡
        - Technical refinement requested by user (English semantic tokens): "${semanticTokensStr}".
        - Original directive: "${chatTrigger.trim()}".
        - Incorporate this directive into your output constraints and prompt formulation.
        `;
      }

      const styleModifier = `
        ⚡ STYLE PRESET DIRECTIVE: ${targetStyle.toUpperCase()} ⚡
        - Align visual treatment, color palette, and mood with '${targetStyle}' photography style.
      `;

      const prompt = `
        🚨 MULTI IMAGE ROLE LOCK 🚨
        
        ROLES:
        - MAIN_IMAGE (${mainFileName}): scene + pose + lighting.
        - REFERENCE_IMAGE (${replacementFileName}): identity (face + body).
        - OUTFIT_IMAGE (${outfitFileName || "N/A"}): clothing ONLY.
        
        🎯 ANALYSIS FIDELITY HIERARCHY (STRICT PRIORITY ORDER) 🎯
        Extract and fill all analysis fields according to the following strict priority hierarchy:
        1. REPLACEMENT SUBJECT IDENTITY (REFERENCE_IMAGE): Extract exact visible facial structure (face_shape), hairstyle/color/length (hair), visible expression (expression), skin tone (skin_tone), and distinctive visual traits. Do NOT guess or fabricate ungrounded traits not clearly visible.
        2. POSE & ORIENTATION (MAIN_IMAGE): Record subject posture, body flow, and orientation relative to camera.
        3. OUTFIT (OUTFIT_IMAGE or MAIN_IMAGE): Clothing items, fabric texture, and fit.
        4. SCENE LIGHTING (MAIN_IMAGE): Direction, quality (hard vs soft), and color temperature/palette of main scene.
        5. ENVIRONMENT & CAMERA (MAIN_IMAGE): Setting/background, camera angle/elevation, framing, and depth.

        CRITICAL STABILITY RULES:
        - Higher priority details MUST NOT be sacrificed for general environment descriptions.
        - If a trait is not clearly visible in the image, return an empty string ("") or "not clearly visible".
        - ABSOLUTELY NO GUESSING or speculating ungrounded demographic attributes.

        Analyze images and generate a subject replacement prompt for Nano mode.
        ${multiSubjectModifier}
        ${chatTriggerModifier}
        ${styleModifier}
        ${modeInstructions}

        CRITICAL:
        1. Replace subject in ${mainFileName} with subject from ${replacementFileName}.
        2. Use the word "subject" or the specific target role.
        3. Match lighting, camera angle, and environment from ${mainFileName}.
        4. Detect exact skin tone and ethnicity markers from ${replacementFileName} and return as 'skin_tone'.
        5. simulation: Provide a literal visual description of the final composite scene. Do not include execution strategies, meta-instructions, or engine jargon. If details are missing, omit them.
        6. Output valid JSON matching the provided schema.
      `;

      const currentSchema = {
        type: Type.OBJECT,
        properties: {
          analysis: {
            type: Type.OBJECT,
            properties: {
              lighting: { type: Type.STRING },
              angle: { type: Type.STRING },
              environment: { type: Type.STRING },
            },
            required: ["lighting", "angle", "environment"],
          },
          prompts: {
            type: Type.OBJECT,
            properties: {
              lighting_type: { type: Type.STRING },
              color_tones: { type: Type.STRING },
              pose: { type: Type.STRING },
              outfit: { type: Type.STRING },
              negative: { type: Type.STRING },
              skin_tone: { type: Type.STRING },
              face_shape: { type: Type.STRING },
              hair: { type: Type.STRING },
              expression: { type: Type.STRING },
            },
            required: ["lighting_type", "color_tones", "pose", "outfit", "negative", "skin_tone"],
          },
          simulation: { 
            type: Type.STRING,
            description: "A concise, literal visual description of the final composite (subject, clothing, pose, environment, lighting). ABSOLUTELY NO META-INSTRUCTIONS, ENGINE JARGON, OR EXECUTION STEPS."
          }
        },
        required: ["analysis", "prompts", "simulation"],
      };

      console.log("Calling OpenRouter Vision API...");
      setLoadingMessage("Executing vision intelligence analysis...");
      const apiRequest = safeGenerateContent({
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: reconstructedMainBase64 } },
            { inlineData: { mimeType: "image/jpeg", data: replacementBase64 } },
            ...(outfitImage && outfitBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: outfitBase64 } }] : []),
            { text: `Final Instruction: Replace the subject in ${mainFileName} with the subject from ${replacementFileName} while ${poseMode === "LOCKED" ? "preserving original pose" : poseMode === "BLEND" ? "preserving base pose with natural variation" : "adopting the pose from the reference subject"}.` }
          ],
        },
        config: {
          temperature: 0.15,
          responseMimeType: "application/json",
          responseSchema: currentSchema,
        },
      }, {
        onQueueWait: (elapsedSec, cancelWait) => {
          setQueueWaitInfo({ seconds: elapsedSec, cancel: cancelWait });
        },
        onWaitEnd: () => {
          setQueueWaitInfo(null);
        }
      });

      const rawResult = await Promise.race([apiRequest, timeoutPromise]) as any;
      console.log("Gemini API response received.");
      console.timeEnd(`generatePrompts_${requestId}`);
      
      // FIX 2: Cancel Previous Request (Anti Overlap)
      if (requestId !== currentRequestIdRef.current) return;

      const text = rawResult.text;
      if (!text) throw new Error("EMPTY_RESPONSE");



      const rawParsed = JSON.parse(extractJSON(text)) || {};
      const data: AIResponse = {
        analysis: {
          lighting: asString(rawParsed.analysis?.lighting),
          angle: asString(rawParsed.analysis?.angle),
          environment: asString(rawParsed.analysis?.environment),
        },
        prompts: rawParsed.prompts ? {
          lighting_type: asString(rawParsed.prompts.lighting_type),
          color_tones: asString(rawParsed.prompts.color_tones),
          pose: asString(rawParsed.prompts.pose),
          outfit: asString(rawParsed.prompts.outfit),
          negative: asString(rawParsed.prompts.negative),
          skin_tone: asString(rawParsed.prompts.skin_tone),
          face_shape: asString(rawParsed.prompts.face_shape),
          hair: asString(rawParsed.prompts.hair),
          expression: asString(rawParsed.prompts.expression),
          prompt: asString(rawParsed.prompts.prompt),
        } : {
          lighting_type: "",
          color_tones: "",
          pose: "",
          outfit: "",
          negative: "",
          skin_tone: "",
          face_shape: "",
          hair: "",
          expression: "",
          prompt: ""
        },
        simulation: asString(rawParsed.simulation) || "Simulation not available."
      };
      
      // optimize_self_check_v1: Log success
      console.log(`Analysis successful on attempt ${retryCount + 1}`);
      
      // --- POST-PROCESSING SANITIZATION ---
      const sanitize = (text: string) => {
        let result = asString(text);
        if (poseMode === "LOCKED") {
          result = result
            .replace(/\b(looking|touching|interacting|gaze|downward gaze|looking down)\b/gi, "maintaining original pose")
            .replace(/\b(hands|face|arms|eyes|fingers|posture)\b/gi, "original pose");
        }
        return result
          .replace(/\bpose and posture\b/gi, "pose")
          .replace(/\b(person|man|woman)\b/gi, "subject");
      };

      const attributes = buildAutoSubjectAttributes(
        targetMode === 'nano' ? (data.prompts?.pose || "") : (data.prompts?.prompt || ""),
        asString(data.analysis?.environment),
        asString(data.analysis?.lighting) || asString(data.prompts?.lighting_type) || asString(data.prompts?.color_tones),
        targetPoseMode,
        asString(data.prompts?.skin_tone),
        anatomyProfile,
        {
          face_shape: data.prompts?.face_shape,
          hair: data.prompts?.hair,
          expression: data.prompts?.expression
        }
      );

      // --- PATCH — AUTO LIGHTING INJECTION (V1) ---
      const env = asString(data.analysis?.environment);
      const lighting = asString(data.analysis?.lighting);
      const baseLighting = detectSceneLighting(env, lighting);
      
      // 🔥 COMMAND 4: ENV PRESET CORRECTION
      let finalEnvPreset = targetEnvPreset;
      if (env.toLowerCase().includes("indoor") && targetEnvPreset === "DAYLIGHT") {
        finalEnvPreset = "STUDIO"; 
      }
      
      let autoLightingStr = `${baseLighting}${finalEnvPreset !== "STREET" ? ` (${finalEnvPreset})${targetAtmosPreset !== "NONE" ? ` + ${targetAtmosPreset}` : ""}` : (targetAtmosPreset !== "NONE" ? ` + ${targetAtmosPreset}` : "")}`;
      
      // 🔥 CLEANUP AUTO LIGHTING ARTIFACTS
      autoLightingStr = autoLightingStr
        .replace(/\(AUTO\)/gi, "")
        .replace(/\s+\+\s+AUTO/gi, "")
        .replace(/AUTO/gi, "")
        .replace(/\s+/g, " ")
        .replace(/,\s*,\s*/g, ", ")
        .trim();

      if (!autoLightingStr || autoLightingStr.length < 5) {
        autoLightingStr = baseLighting.replace(/\(AUTO\)/gi, "").trim() || "Natural environmental lighting";
      }
      
      // 🔥 APPLY TO RAW DATA TO ENSURE ENGINE CONSISTENCY
      if (data.analysis) {
        data.analysis.lighting = autoLightingStr;
      } 

      // 🔒 [STABLE ZONE: RECONCILIATION & DISPATCHER LAYER]
      const reconciliation = reconcileLocalWithLLM(data, {
        mainDetection,
        replacementDetection,
        mainPose,
        replacementPose
      });

      // --- PHASE 5-2: ANALYSIS CHECKPOINT CUT POINT ---
      setCheckpointData({
        data: reconciliation.data,
        context: {
          mainDetection,
          replacementDetection,
          mainPose,
          replacementPose,
          mainFileName,
          replacementFileName,
          outfitFileName,
          outfitImage,
          targetPoseMode,
          targetEnvPreset,
          targetAtmosPreset,
          anatomyProfile,
          targetMode,
          cleanedScene,
          reconstructedScene,
          isMultiSubject,
          targetSubjectRole,
          targetStyle,
          autoLightingStr,
          sanitize,
          attributes,
          coverageOverride: reconciliation.replacementCoverageOverride,
          chatTrigger: chatTrigger.trim()
        }
      });
      setEditedCheckpoint(JSON.parse(JSON.stringify(reconciliation.data))); 
      setLoading(false);
      return;
    } catch (err: any) {
      console.timeEnd(`generatePrompts_${requestId}`);
      // FIX 2: Cancel Previous Request (Anti Overlap)
      if (requestId !== currentRequestIdRef.current) return;

      if (err?.name === "QueueCancelledError" || err instanceof QueueCancelledError || err?.message?.includes("dibatalkan oleh pengguna")) {
        console.log("[App] Queue wait cancelled by user");
        setLoading(false);
        setQueueWaitInfo(null);
        return;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Analysis failed on attempt ${retryCount + 1}:`, errorMessage);
      setError(`Analysis Failed: ${errorMessage}. Please check your network or try again.`);
      setResult(null);
      setUniversalPrompt(null);
    } finally {
      setLoading(false);
      setQueueWaitInfo(null);
    }
  };

  const generatePreviewImage = async (prompt: string, negative: string = "") => {
    if (!prompt || !mainImage || !replacementImage) {
      setError("Please upload both main scene and replacement subject before generating preview.");
      return;
    }
    
    setIsGeneratingImage(true);
    setGeneratedImage(null);
    setHumanNarrative(null);
    setError(null);
    
    try {
      // --- PHASE 1: GENERATE HUMAN NARRATIVE (V5.3.6) ---
      setIsGeneratingNarrative(true);
      const narrativeInstruction = `[ROLE]
You are a creative visual storyteller. Your task is to transform a technical image reconstruction prompt into a friendly dual-language narrative (Indonesian and English).

[CONTEXT]
- REFERENCE_SUBJECT: ${replacementFileName}
- MAIN_SCENE: ${mainFileName}
- TECHNICAL_PROMPT: ${prompt}
- USER_INSTRUCTION (CHAT TRIGGER): ${chatTrigger || "None"}

[OUTPUT_FORMAT]
**Bahasa Indonesia:**
[Penjelasan di sini]

**English:**
[Explanation here]

[RULES]
1. Explain how the subject from ${replacementFileName} will be transformed into ${mainFileName}.
2. Acknowledge user's chat trigger if present.
3. Max 3 sentences per language.`;

      const narrativeResponse = await safeGenerateContent({
        contents: narrativeInstruction,
      }, {
        onQueueWait: (elapsedSec, cancelWait) => {
          setQueueWaitInfo({ seconds: elapsedSec, cancel: cancelWait });
        },
        onWaitEnd: () => {
          setQueueWaitInfo(null);
        }
      });

      if (narrativeResponse && narrativeResponse.text) {
        setHumanNarrative(narrativeResponse.text);
      }
      setIsGeneratingNarrative(false);

      // --- PHASE 2: IMAGE RECONSTRUCTION ---
      const aspectRatio = await getImageAspectRatio(mainImage);
      // Use cleanedScene if available (D44)
      const baseScene = result?.cleanedScene || mainImage;
      
      const genResult = await reconstructImageWithAssets(
        prompt,
        baseScene,
        replacementImage,
        outfitImage,
        negative,
        aspectRatio,
        chatTrigger
      );
      
      if (genResult.success && genResult.base64) {
        setGeneratedImage(genResult.base64);
      } else {
        throw new Error(genResult.error || "Failed to generate image");
      }
    } catch (err: any) {
      if (err?.name === "QueueCancelledError" || err instanceof QueueCancelledError || err?.message?.includes("dibatalkan oleh pengguna")) {
        console.log("[App] Queue wait cancelled by user in preview generation");
        setIsGeneratingNarrative(false);
        setIsGeneratingImage(false);
        setQueueWaitInfo(null);
        return;
      }
      console.error("Image generation error:", err);
      const errorMessage = err?.message || (typeof err === "string" ? err : "Failed to generate image preview");
      setError(errorMessage);
    } finally {
      setIsGeneratingImage(false);
      setIsGeneratingNarrative(false);
      setQueueWaitInfo(null);
    }
  };

  // FIX 1: Debounce Auto-Regenerate with Style forwarding
  const triggerRegenerate = (
    mode: OutputMode = outputMode, 
    pMode: PoseMode = poseMode, 
    ePreset: EnvPreset = envPreset, 
    aPreset: AtmosPreset = atmosPreset,
    sStyle: Style = style
  ) => {
    if (regenerateTimeoutRef.current) {
      clearTimeout(regenerateTimeoutRef.current);
    }
    regenerateTimeoutRef.current = setTimeout(() => {
      generatePrompts(mode, pMode, ePreset, aPreset, sStyle);
    }, 400);
  };

  const exportToPDF = async () => {
    if (!result) return;

    const activePrompt = result.nano ? (result.nano[nanoVariant] || result.nano.expert) : (result.sd?.prompt || result.mj?.prompt || "");
    const activeNegative = result.nano?.negative || result.sd?.negative || "";

    const data = {
      simulation: result.simulation,
      analysis: result.analysis,
      subjectAttributes: result.subjectAttributes || "Auto",
      masterPrompt: activePrompt,
      negativePrompt: activeNegative,
      poseMode: poseMode,
      anatomyAuthority: anatomyProfile ? "MANUAL" : "AUTO",
      images: {
        main: mainImage,
        target: replacementImage,
        outfit: outfitImage,
      },
    };

    exportPDFV6(data);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20 tech-grid">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg shadow-slate-200">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none tracking-tight">Subject Replacement</h1>
              <p className="label-micro text-brand-600 mt-1">Prompt Generator V5.0.0 (GOLD MASTER)</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="label-micro">System Status</span>
              <span className="text-[10px] font-mono text-green-600 flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-green-600 animate-pulse"></div>
                Operational
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <section className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-slate-900 rounded-full"></div>
                  <h2 className="label-micro text-slate-800">Source Assets</h2>
                </div>
                <span className="text-[10px] font-mono text-slate-400">01 / INPUT</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <ImageUpload 
                  id="main-image"
                  label="Main Scene" 
                  image={mainImage} 
                  dynamicAspect={true}
                  detection={mainDetection}
                  isDetecting={isDetectingMain}
                  cutout={mainCutout}
                  isMasking={isMaskingMain}
                  depth={mainDepth}
                  isDepth={isDepthMain}
                  pose={mainPose}
                  isPosing={isPosingMain}
                  onUpload={async (src, name) => {
                    setMainImage(src);
                    setMainFileName(name);
                    const rid = ++mainVisionRequestIdRef.current;
                    
                    setIsDetectingMain(true);
                    setIsMaskingMain(true);
                    setIsDepthMain(true);
                    setIsPosingMain(true);
                    try {
                      const visionResults = await runVisionEnginesSafe({ base: src });
                      
                      // Check if this request is still the latest
                      if (rid !== mainVisionRequestIdRef.current) return;

                      const { detection, mask, depth, pose } = visionResults;
                      
                      setMainDetection(detection);
                      if (mask) setMainCutout(mask.cutout);
                      if (depth) setMainDepth(depth);
                      if (pose) setMainPose(pose);
                    } finally {
                      if (rid === mainVisionRequestIdRef.current) {
                        setIsDetectingMain(false);
                        setIsMaskingMain(false);
                        setIsDepthMain(false);
                        setIsPosingMain(false);
                      }
                    }
                  }} 
                  onClear={() => {
                    setMainImage(null);
                    setMainFileName("");
                    setMainDetection(null);
                    setMainCutout(null);
                    setMainDepth(null);
                    setMainPose(null);
                    setResult(null);
                  }}
                />
                <ImageUpload 
                  id="replacement-image"
                  label="Replacement Subject" 
                  image={replacementImage} 
                  detection={replacementDetection}
                  isDetecting={isDetectingReplacement}
                  cutout={replacementCutout}
                  isMasking={isMaskingReplacement}
                  depth={replacementDepth}
                  isDepth={isDepthReplacement}
                  pose={replacementPose}
                  isPosing={isPosingReplacement}
                  onUpload={async (src, name) => {
                    setReplacementImage(src);
                    setReplacementFileName(name);
                    const rid = ++replacementVisionRequestIdRef.current;

                    setIsDetectingReplacement(true);
                    setIsMaskingReplacement(true);
                    setIsDepthReplacement(true);
                    setIsPosingReplacement(true);
                    try {
                      const visionResults = await runVisionEnginesSafe({ base: src });
                      if (rid !== replacementVisionRequestIdRef.current) return;

                      const { detection, mask, depth, pose } = visionResults;
                      
                      setReplacementDetection(detection);
                      if (mask) setReplacementCutout(mask.cutout);
                      if (depth) setReplacementDepth(depth);
                      if (pose) setReplacementPose(pose);
                    } finally {
                      if (rid === replacementVisionRequestIdRef.current) {
                        setIsDetectingReplacement(false);
                        setIsMaskingReplacement(false);
                        setIsDepthReplacement(false);
                        setIsPosingReplacement(false);
                      }
                    }
                  }} 
                  onClear={() => {
                    setReplacementImage(null);
                    setReplacementFileName("");
                    setReplacementDetection(null);
                    setReplacementCutout(null);
                    setReplacementDepth(null);
                    setReplacementPose(null);
                    setResult(null);
                  }}
                />
                <ImageUpload 
                  id="outfit-image"
                  label="Custom Outfit (Optional)" 
                  image={outfitImage} 
                  detection={outfitDetection}
                  isDetecting={isDetectingOutfit}
                  cutout={outfitCutout}
                  isMasking={isMaskingOutfit}
                  depth={outfitDepth}
                  isDepth={isDepthOutfit}
                  pose={outfitPose}
                  isPosing={isPosingOutfit}
                  onUpload={async (src, name) => {
                    setOutfitImage(src);
                    setOutfitFileName(name);
                    const rid = ++outfitVisionRequestIdRef.current;

                    setIsDetectingOutfit(true);
                    setIsMaskingOutfit(true);
                    setIsDepthOutfit(true);
                    setIsPosingOutfit(true);
                    try {
                      const visionResults = await runVisionEnginesSafe({ base: src });
                      if (rid !== outfitVisionRequestIdRef.current) return;

                      const { detection, mask, depth, pose } = visionResults;
                      
                      setOutfitDetection(detection);
                      if (mask) setOutfitCutout(mask.cutout);
                      if (depth) setOutfitDepth(depth);
                      if (pose) setOutfitPose(pose);
                    } finally {
                      if (rid === outfitVisionRequestIdRef.current) {
                        setIsDetectingOutfit(false);
                        setIsMaskingOutfit(false);
                        setIsDepthOutfit(false);
                        setIsPosingOutfit(false);
                      }
                    }
                  }} 
                  onClear={() => {
                    setOutfitImage(null);
                    setOutfitFileName("");
                    setOutfitDetection(null);
                    setOutfitCutout(null);
                    setOutfitDepth(null);
                    setOutfitPose(null);
                  }} 
                />
              </div>
            </section>

            <section className="flex flex-col gap-6 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Zap className="w-24 h-24" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-slate-900 rounded-full"></div>
                  <h2 className="label-micro text-slate-800">Configuration</h2>
                </div>
                <span className="text-[10px] font-mono text-slate-400">02 / CONFIG</span>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="label-micro">Style Preset</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['realistic', 'cinematic', 'dramatic'] as Style[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setStyle(s);
                          if (result) triggerRegenerate(outputMode, poseMode, envPreset, atmosPreset, s);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold capitalize transition-all border
                          ${style === s 
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>



                  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-900 text-white shadow-sm">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">Multi-Subject Scene</span>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            {isMultiSubject ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                        <button 
                          onClick={() => setIsMultiSubject(false)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${!isMultiSubject ? 'bg-white text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Single
                        </button>
                        <button 
                          onClick={() => setIsMultiSubject(true)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${isMultiSubject ? 'bg-white text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Multi
                        </button>
                      </div>
                    </div>

                    {isMultiSubject && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-3 mt-2 pt-4 border-t border-slate-100"
                      >
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Target Description (Who to replace)</label>
                          <input 
                            type="text" 
                            value={targetSubjectRole} 
                            onChange={(e) => setTargetSubjectRole(e.target.value)}
                            placeholder="e.g. Man on the left, woman in red dress"
                            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-brand-500 outline-none w-full"
                          />
                          <p className="text-[9px] text-slate-500 mt-1">Specify which person to replace. The AI will isolate this person and leave others unchanged.</p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-white shadow-sm text-brand-600">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Subject Attributes</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-brand-50 border border-brand-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-brand-700 uppercase tracking-wider">Auto-Inferred</span>
                      </div>
                    </div>
                    {result?.subjectAttributes ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-brand-700 font-bold bg-brand-100/50 px-2 py-1 rounded-lg border border-brand-100">
                          Detected: {result.subjectAttributes.replace("Subject attributes:", "").trim()}
                        </span>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                          Physical attributes mapped automatically from scene context and perspective.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Physical attributes (age, height, build) are automatically detected based on scene context and camera perspective.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-slate-900 text-white shadow-sm">
                          <Maximize2 className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">Anatomy Authority</span>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            {anatomyAuthorityMode === 'template' ? 'Template Mode' : 'Manual Override'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                        <button 
                          onClick={() => {
                            setAnatomyAuthorityMode('template');
                            if (!anatomyProfile?.templateId) {
                              const t = asianBodyProfiles.ready_templates[0];
                              setAnatomyProfile({
                                templateId: t.template_id,
                                heightCm: (t.specifications as any).male?.height_cm || (t.specifications as any).female?.height_cm,
                                weightKg: (t.specifications as any).male?.weight_kg || (t.specifications as any).female?.weight_kg,
                                buildType: t.body_classification_default,
                                bodyFrame: t.geometric_silhouette_default,
                                physicalTraits: t.physical_traits || []
                              });
                            }
                          }}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${anatomyAuthorityMode === 'template' ? 'bg-white text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Templates
                        </button>
                        <button 
                          onClick={() => {
                            setAnatomyAuthorityMode('custom');
                            if (anatomyProfile?.templateId) {
                               const currentProfile = { ...anatomyProfile };
                               delete currentProfile.templateId;
                               setAnatomyProfile(currentProfile);
                            }
                          }}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all ${anatomyAuthorityMode === 'custom' ? 'bg-white text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Custom
                        </button>
                      </div>
                    </div>

                    {anatomyAuthorityMode === 'template' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-3 mt-2 pt-4 border-t border-slate-100"
                      >
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Select Asian Body Profile</label>
                          <div className="flex flex-col gap-2">
                            {asianBodyProfiles.ready_templates.map(t => (
                              <button
                                key={t.template_id}
                                onClick={() => setAnatomyProfile({
                                  templateId: t.template_id,
                                  heightCm: (t.specifications as any).male?.height_cm || (t.specifications as any).female?.height_cm,
                                  weightKg: (t.specifications as any).male?.weight_kg || (t.specifications as any).female?.weight_kg,
                                  buildType: t.body_classification_default,
                                  bodyFrame: t.geometric_silhouette_default,
                                  physicalTraits: t.physical_traits || []
                                })}
                                className={`text-left p-3 rounded-xl border transition-all ${anatomyProfile?.templateId === t.template_id ? 'bg-brand-50 border-brand-200 shadow-sm' : 'bg-white border-slate-200 hover:border-brand-200'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-bold ${anatomyProfile?.templateId === t.template_id ? 'text-brand-700' : 'text-slate-700'}`}>{t.template_name}</span>
                                  <span className="text-[10px] text-slate-400 font-medium px-2 border border-slate-200 rounded-md">{t.target_gender}</span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {t.physical_traits?.map((pt: string) => (
                                    <span key={pt} className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                      {pt}
                                    </span>
                                  ))}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {anatomyAuthorityMode === 'custom' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-4 mt-2 pt-4 border-t border-slate-100"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Height (cm)</label>
                            <input 
                              type="number" 
                              value={anatomyProfile?.heightCm || ""} 
                              onChange={(e) => setAnatomyProfile({...anatomyProfile, heightCm: parseInt(e.target.value) || undefined})}
                              placeholder="e.g. 175"
                              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-brand-500 outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Weight (kg)</label>
                            <input 
                              type="number" 
                              value={anatomyProfile?.weightKg || ""} 
                              onChange={(e) => setAnatomyProfile({...anatomyProfile, weightKg: parseInt(e.target.value) || undefined})}
                              placeholder="e.g. 70"
                              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-brand-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Build & Frame</label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { key: 'buildType', options: Object.keys(asianBodyProfiles.body_classifications) },
                              { key: 'bodyFrame', options: Object.keys(asianBodyProfiles.geometric_silhouettes) },
                              { key: 'shoulderWidth', options: ['narrow', 'average', 'broad'] },
                            ].map((group) => (
                              <div key={group.key} className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-400 capitalize">{group.key.replace(/([A-Z])/g, ' $1')}</span>
                                <div className="flex flex-wrap gap-1">
                                  {group.options.map((opt) => {
                                    // Use user-friendly labels for build/frame
                                    let label = opt;
                                    if (group.key === 'buildType') label = (asianBodyProfiles.body_classifications as any)[opt]?.type || opt;
                                    if (group.key === 'bodyFrame') label = (asianBodyProfiles.geometric_silhouettes as any)[opt]?.name.split('/')[0].trim() || opt;
                                    return (
                                      <button
                                        key={opt}
                                        onClick={() => setAnatomyProfile({...anatomyProfile, [group.key]: opt})}
                                        className={`px-2 py-1 rounded-md text-[9px] font-bold border transition-all ${anatomyProfile?.[group.key as keyof AnatomyProfile] === opt ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'}`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Proportions</label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { key: 'torsoRatio', options: ['short', 'balanced', 'long'] },
                              { key: 'legProportion', options: ['short', 'balanced', 'long'] },
                            ].map((group) => (
                              <div key={group.key} className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-400 capitalize">{group.key.replace(/([A-Z])/g, ' $1')}</span>
                                <div className="flex gap-1">
                                  {group.options.map((opt) => (
                                    <button
                                      key={opt}
                                      onClick={() => setAnatomyProfile({...anatomyProfile, [group.key]: opt})}
                                      className={`px-2 py-1 rounded-md text-[9px] font-bold border transition-all ${anatomyProfile?.[group.key as keyof AnatomyProfile] === opt ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'}`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Redundant Apply Changes button removed per user request */}
                      </motion.div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white shadow-sm text-brand-600">
                        <Move className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Pose Control Engine</span>
                        <span className="text-[10px] text-slate-500">
                          {poseMode === "LOCKED" ? "Strictly preserve original stance" : poseMode === "BLEND" ? "Keep base pose, adjust gestures and upper body expression" : "Full creative freedom for AI"}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex p-1 bg-slate-200/50 rounded-xl border border-slate-200/50">
                    {(["LOCKED", "BLEND", "FREE", "AUTO"] as PoseMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setPoseMode(mode);
                          if (result) triggerRegenerate(outputMode, mode, envPreset, atmosPreset);
                        }}
                        className={`flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center gap-0.5
                          ${poseMode === mode 
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200' 
                            : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 px-4 mb-2">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    {poseMode === "LOCKED" ? "Strictly preserve original stance" : 
                     poseMode === "BLEND" ? "Keep base pose, adjust gestures and upper body expression" : 
                     poseMode === "FREE" ? "Full creative freedom for AI" :
                     "Deterministic AI selection based on scene & pose"}
                  </span>
                </div>

                {/* Environment Preset System */}
                <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white shadow-sm text-brand-600">
                        <Camera className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Environment Setup</span>
                        <span className="text-[10px] text-slate-500">
                          Primary: {envPreset} | Secondary: {atmosPreset === "NONE" ? "None" : atmosPreset}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Primary Preset */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">Primary Lighting</span>
                    <div className="flex p-1 bg-slate-200/50 rounded-xl border border-slate-200/50">
                      {(["AUTO", "CLUB", "STREET", "DAYLIGHT", "STUDIO"] as EnvPreset[]).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            setEnvPreset(preset);
                            if (result) triggerRegenerate(outputMode, poseMode, preset, atmosPreset);
                          }}
                          className={`flex-1 py-1.5 px-0.5 rounded-lg text-[9px] font-bold transition-all flex flex-col items-center
                            ${envPreset === preset 
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200' 
                              : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Secondary Atmos */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">Secondary Atmosphere</span>
                    <div className="flex p-1 bg-slate-200/50 rounded-xl border border-slate-200/50">
                      {(["AUTO", "NONE", "FOG", "RAIN", "BACKLIGHT"] as AtmosPreset[]).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            setAtmosPreset(preset);
                            if (result) triggerRegenerate(outputMode, poseMode, envPreset, preset);
                          }}
                          className={`flex-1 py-1.5 px-0.5 rounded-lg text-[9px] font-bold transition-all flex flex-col items-center
                            ${atmosPreset === preset 
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200' 
                              : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {queueWaitInfo ? (
                <div className="w-full p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                    <span>Menunggu giliran model… ({queueWaitInfo.seconds}s)</span>
                  </div>
                  <button
                    onClick={queueWaitInfo.cancel}
                    className="px-3 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold transition-colors"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => generatePrompts()}
                  disabled={loading || !mainImage || !replacementImage}
                  className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all
                    ${loading || !mainImage || !replacementImage
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-brand-600 hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-slate-200'}`}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {loadingMessage}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Prompts
                    </>
                  )}
                </button>
              )}

              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-red-600 label-micro">
                    <ShieldAlert className="w-4 h-4" />
                    Analysis Error
                  </div>
                  <p className="text-[10px] text-red-600/80 leading-relaxed font-medium">
                    {error}
                  </p>
                  <button 
                    onClick={() => generatePrompts()}
                    className="w-full py-2 rounded-lg bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry Analysis
                  </button>
                </div>
              )}
            </section>

            {/* History Section */}
            {history.length > 0 && (
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-slate-400 rounded-full"></div>
                    <h2 className="label-micro text-slate-500">Recent History</h2>
                  </div>
                  <button 
                    onClick={() => {
                      setHistory([]);
                      localStorage.removeItem('prompt_history');
                    }}
                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {history.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setResult(entry.result);
                        setUniversalPrompt(null);
                        if (entry.mainImage) setMainImage(entry.mainImage);
                        if (entry.replacementImage) setReplacementImage(entry.replacementImage);
                        if (entry.outfitImage) setOutfitImage(entry.outfitImage);
                        setMainFileName(entry.mainFileName || "history_main.jpg");
                        setReplacementFileName(entry.replacementFileName || "history_replacement.jpg");
                        if (entry.outfitFileName) setOutfitFileName(entry.outfitFileName);
                        if (entry.replacementDetection) setReplacementDetection(entry.replacementDetection);
                        setStyle(entry.style);
                        setOutputMode(entry.outputMode);
                        setPoseMode(entry.poseMode || (entry.keepPose === false ? "FREE" : "LOCKED"));
                        if (entry.envPreset) setEnvPreset(entry.envPreset);
                        if (entry.atmosPreset) setAtmosPreset(entry.atmosPreset);
                        if (entry.anatomyAuthorityMode) setAnatomyAuthorityMode(entry.anatomyAuthorityMode);
                        if (entry.isMultiSubject !== undefined) setIsMultiSubject(entry.isMultiSubject);
                        if (entry.targetSubjectRole) setTargetSubjectRole(entry.targetSubjectRole);
                        if (entry.anatomyProfile) setAnatomyProfile(entry.anatomyProfile);
                      }}
                      className="p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3 hover:border-brand-400 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0 bg-slate-50 flex items-center justify-center">
                        {entry.mainImage ? (
                          <img src={entry.mainImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[10px] font-bold text-slate-800 truncate">{entry.result.analysis.environment}</span>
                        <span className="text-[9px] text-slate-400 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <ChevronRight className="w-3 h-3 text-slate-300 ml-auto group-hover:text-brand-500 transition-colors" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6"
                >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-slate-900 rounded-full"></div>
                        <h2 className="label-micro text-slate-800">Generation Result</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={exportToPDF}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-brand-600 hover:border-brand-200 transition-all shadow-sm"
                          title="Export to PDF"
                        >
                          <Download className="w-3 h-3" />
                          Export PDF
                        </button>
                        <span className="text-[10px] font-mono text-slate-400">03 / OUTPUT</span>
                      </div>
                    </div>

                  {/* Simulation Panel */}
                  <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                      <ImageIcon className="w-48 h-48" />
                    </div>
                    <div className="flex items-center gap-2 mb-6">
                      <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-display italic font-black text-slate-900">Visual Simulation</h3>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-sm font-medium italic relative z-10">
                      "{result.simulation}"
                    </p>
                    <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="label-micro">Lighting</span>
                        <span className="value-mono">{result.analysis.lighting}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="label-micro">Angle</span>
                        <span className="value-mono">{result.analysis.angle}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="label-micro">Env</span>
                        <span className="value-mono truncate">{result.analysis.environment}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="label-micro">Subject Attr</span>
                        <span className="value-mono truncate">{result.subjectAttributes?.replace("Subject attributes:", "").trim() || "Auto"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Prompts */}
                  <div className="grid grid-cols-1 gap-4">
                    {outputMode === 'nano' && (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nano Variant</span>
                          <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                            {(['basic', 'advanced', 'expert'] as NanoVariant[]).map((v) => (
                              <button
                                key={v}
                                onClick={() => setNanoVariant(v)}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-all ${
                                  nanoVariant === v
                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                        <PromptCard 
                          title={`Master Execution Prompt (${nanoVariant.toUpperCase()})`} 
                          content={result.nano[nanoVariant] || result.nano.expert} 
                          icon={Sparkles} 
                          variant="expert"
                        />
                        <PromptCard 
                          title="Negative Prompt" 
                          content={result.nano.negative} 
                          icon={ShieldAlert} 
                          variant="negative"
                        />
                        {universalPrompt && (
                          <UniversalPromptCard 
                            prompt={universalPrompt.prompt} 
                            negative={universalPrompt.negative} 
                          />
                        )}
                      </div>
                    )}
                    {result.sd?.prompt && (
                      <>
                        <PromptCard 
                          title="SD Prompt (Historical)" 
                          content={result.sd.prompt} 
                          icon={Layers} 
                          variant="expert"
                        />
                        {result.sd.negative && (
                          <PromptCard 
                            title="Negative Prompt" 
                            content={result.sd.negative} 
                            icon={ShieldAlert} 
                            variant="negative"
                          />
                        )}
                      </>
                    )}
                    {result.mj?.prompt && (
                      <PromptCard 
                        title="MJ Prompt (Historical)" 
                        content={result.mj.prompt} 
                        icon={Sparkles} 
                        variant="expert"
                      />
                    )}
                  </div>

                  {/* Optional Image Generation Preview */}
                  <div className="mt-4 p-8 rounded-3xl bg-slate-100/50 border border-slate-200 border-dashed relative overflow-hidden">
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-white shadow-sm text-brand-600">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Image Generation Preview <span className="text-[10px] font-normal text-slate-400 capitalize">(Optional)</span></h3>
                            <p className="text-[10px] text-slate-500">Generate a sample image based on the generated prompt using Gemini 3.1 Flash Lite Image.</p>
                          </div>
                        </div>
                      </div>

                      {/* Narrative Section (Visible during and after generation) */}
                      <AnimatePresence>
                        {(isGeneratingNarrative || humanNarrative) && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full max-w-lg mx-auto p-5 rounded-2xl bg-white border border-brand-100 shadow-sm relative overflow-hidden"
                          >
                            <div className="absolute top-0 left-0 w-1 h-full bg-brand-500" />
                            <div className="flex items-center gap-2 mb-3">
                              <Zap className="w-3.5 h-3.5 text-brand-500" />
                              <span className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.2em]">Synthesis Plan & Narrative</span>
                            </div>
                            {isGeneratingNarrative ? (
                              <div className="space-y-2">
                                <div className="h-3 w-full bg-slate-100 rounded-full animate-pulse" />
                                <div className="h-3 w-[80%] bg-slate-100 rounded-full animate-pulse" />
                              </div>
                            ) : (
                              <div className="text-xs text-slate-600 leading-relaxed space-y-4 font-medium italic">
                                {humanNarrative?.split('\n\n').map((para, i) => {
                                  const isIndo = para.includes('Bahasa Indonesia:');
                                  const isEng = para.includes('English:');
                                  return (
                                    <div key={i} className={isIndo ? "border-l-2 border-slate-100 pl-3 py-1" : "pl-3 py-1"}>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        {isIndo ? "🇮🇩 Indonesian" : isEng ? "🇺🇸 English" : ""}
                                      </p>
                                      {para.replace(/Bahasa Indonesia:|English:/i, "").trim()}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {generatedImage ? (
                        <div className="flex flex-col gap-4">
                          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white group shadow-xl max-w-sm mx-auto">
                            <img 
                              src={generatedImage} 
                              alt="Generated Preview" 
                              className="w-full h-auto object-cover" 
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setGeneratedImage(null);
                                  setHumanNarrative(null);
                                }}
                                className="p-2 rounded-lg bg-black/50 text-white hover:bg-red-500 transition-colors"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-center text-slate-400 italic font-mono uppercase tracking-widest">
                            Generated Sample Preview • Gemini 3.1 Flash Lite Image
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4 items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
                          <p className="text-xs text-slate-500 font-medium text-center max-w-xs">
                            Would you like to see a sample image from the prompt? 
                            <br/>
                            <span className="text-[10px] text-brand-600 font-bold uppercase tracking-widest mt-1 inline-block">Pro-Tip: Use Chat Trigger to refine results.</span>
                          </p>

                          {/* Chat Trigger Input */}
                          <div className="w-full max-w-sm space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <Zap className="w-3 h-3 text-brand-500" />
                              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Chat Trigger (Optional)</span>
                            </div>
                            <textarea 
                              placeholder="Contoh: Buat rambutnya sedikit berantakan, atau warnai baju dengan warna merah..."
                              value={chatTrigger}
                              onChange={(e) => setChatTrigger(e.target.value)}
                              className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all placeholder:text-slate-300 min-h-[80px] resize-none"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => generatePreviewImage(result.nano?.expert || result.sd?.prompt || result.mj?.prompt || "", result.nano?.negative || result.sd?.negative || "")}
                              disabled={isGeneratingImage}
                              className="px-8 py-4 rounded-2xl bg-brand-600 text-white text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-brand-700 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 shadow-xl shadow-brand-200"
                            >
                              {isGeneratingImage ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              {isGeneratingImage ? 'Processing Synthesis...' : 'Execute Reconstruction'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-[400px] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-10"
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mb-6">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Ready for Analysis</h3>
                  <p className="text-sm text-slate-500 max-w-xs">
                    Upload your source images and configure your preferences to generate professional replacement prompts.
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                      Step 1: Upload
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                      Step 2: Configure
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                      Step 3: Generate
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-6xl mx-auto px-6 mt-20 pb-10">
        <div className="p-8 rounded-3xl bg-white border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="p-2 rounded-lg bg-slate-50">
              <Info className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">Analysis by OpenRouter · Image generation by Gemini Nano Banana</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="label-micro hover:text-brand-600 transition-colors">Documentation</a>
            <a href="#" className="label-micro hover:text-brand-600 transition-colors">Safety</a>
            <a href="#" className="label-micro hover:text-brand-600 transition-colors">API Status</a>
          </div>
        </div>
        <div className="mt-8 text-center">
          <p className="text-[10px] font-mono text-slate-300 uppercase tracking-[0.2em]">© 2026 Subject Replacement Labs • All Rights Reserved</p>
        </div>
      </footer>
      {/* Analysis Checkpoint Panel */}
      <AnimatePresence>
        {checkpointData && editedCheckpoint && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-200">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Analysis Checkpoint</h2>
                    <p className="text-xs text-slate-500">Review and refine the AI analysis before prompt compilation.</p>
                  </div>
                </div>
                <button 
                  onClick={cancelCheckpoint}
                  className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* 1. Subject Identity & Attributes */}
                <section className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="w-3 h-3" />
                    Subject Reconstruction
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Pose & Action</label>
                      <textarea 
                        value={editedCheckpoint.prompts?.pose || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, pose: e.target.value }
                        })}
                        className="w-full h-20 p-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none resize-none transition-all"
                        placeholder="Describe subject pose..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Outfit & Clothing</label>
                      <textarea 
                        value={editedCheckpoint.prompts?.outfit || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, outfit: e.target.value }
                        })}
                        className="w-full h-20 p-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none resize-none transition-all"
                        placeholder="Describe subject outfit..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Face Shape</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.face_shape || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, face_shape: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Hair Details</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.hair || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, hair: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Expression</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.expression || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, expression: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Skin Tone</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.skin_tone || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, skin_tone: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                  </div>
                </section>

                {/* 2. Scene & Environment */}
                <section className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Box className="w-3 h-3" />
                    Environmental Analysis
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Environment</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.analysis?.environment || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          analysis: { ...editedCheckpoint.analysis, environment: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Lighting Condition</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.analysis?.lighting || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          analysis: { ...editedCheckpoint.analysis, lighting: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Camera Angle</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.analysis?.angle || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          analysis: { ...editedCheckpoint.analysis, angle: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Lighting Type (Prompt)</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.lighting_type || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, lighting_type: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 ml-1">Color Tones</label>
                      <input 
                        type="text"
                        value={editedCheckpoint.prompts?.color_tones || ""}
                        onChange={(e) => setEditedCheckpoint({
                          ...editedCheckpoint,
                          prompts: { ...editedCheckpoint.prompts, color_tones: e.target.value }
                        })}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none transition-all"
                      />
                    </div>
                  </div>
                </section>

                {/* 3. Logic & Simulation */}
                <section className="space-y-4 pb-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Zap className="w-3 h-3" />
                    Execution Strategy
                  </h3>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-600 ml-1">Simulation Log (Technical Sequence)</label>
                    <textarea 
                      value={editedCheckpoint.simulation || ""}
                      onChange={(e) => setEditedCheckpoint({
                        ...editedCheckpoint,
                        simulation: e.target.value
                      })}
                      className="w-full h-32 p-4 text-xs font-mono rounded-xl border border-slate-200 bg-slate-900 text-slate-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none resize-none transition-all"
                      placeholder="Simulation steps..."
                    />
                  </div>
                </section>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <button 
                  onClick={cancelCheckpoint}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Discard Changes
                </button>
                <button 
                  onClick={compilePromptsFromCheckpoint}
                  className="px-8 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  Compile Prompts
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
