/**
 * PHASE D49 — BODY SOURCE OF TRUTH LOCK (CRITICAL)
 * Establishes ANATOMY_AUTHORITY as the single source of truth for all body generation.
 */

import { CoverageResult } from "../analysis/subjectCoverageAnalyzer";
import { buildAnatomyGeometryAuthority } from "./anatomyGeometryAuthority";
import { buildRelativeScalePerceptionLock } from "./relativeScalePerceptionLock";
import { buildFacialIdentityAuthority } from "./facialIdentityAuthority";
import { buildPoseAuthorityIsolationLock } from "./poseAuthorityIsolationLock";
import { buildEnvironmentalRelightingLock } from "./environmentalRelightingLock";
import { buildFacialRelightReconstructionLock } from "./facialRelightReconstructionLock";
import { buildCriticalValidation } from "./criticalValidation";
import { compressPromptAttention } from "../postprocess/promptAttentionCompressor";
import { promptMassReducer } from "../postprocess/promptMassReducer";
import { visualLanguageConverter } from "../postprocess/visualLanguageConverter";
import { collapsePromptMass } from "../postprocess/promptMassCollapse";

export async function buildSubjectGeneration(
  subject: string,
  anatomy: string,
  coverageResult: CoverageResult,
  outfit: string = "",
  multiSubjectInfo: { enabled: boolean; targetRole: string } | null = null,
  config: { poseMode: string; isManual: boolean; envPreset: string; atmosPreset: string }
): Promise<string> {
  const outfitSection = outfit ? `\n━━━━━━━━━━━━━━━━ OUTFIT ━━━━━━━━━━━━━━━━\n\nApply clothing strict reference: ${outfit}\n\nSTRICT RULE: The original clothing must be completely replaced by the requested outfit. Do not merge or retain the scene clothing.\n` : "";

  let multiSubjectSection = "";
  if (multiSubjectInfo && multiSubjectInfo.enabled && multiSubjectInfo.targetRole) {
    multiSubjectSection = `
━━━━━━━━━━━━━━━━ MULTI-SUBJECT ISOLATION LOCK ━━━━━━━━━━━━━━━━

CRITICAL INSTRUCTION: The MAIN_SCENE contains multiple people. You MUST ONLY target and replace: "${multiSubjectInfo.targetRole}".
Do NOT replace any other person.
All other individuals in the scene MUST remain exactly as they appear in the original source image (absolute preservation of their identity, clothing, pose, and lighting).
Treat non-target bystanders as immutable parts of the scene geometry.
`;
  }

  const strategyLockSection = `
━━━━━━━━━━━━━━━━ EXECUTION STRATEGY & LOCK ━━━━━━━━━━━━━━━━

POSE CONTROL ENGINE: ${config.poseMode.toUpperCase()}
ANATOMY AUTHORITY: ${config.isManual ? "MANUAL" : "AUTO"}
ENVIRONMENT PRESET: ${config.envPreset.toUpperCase()}
ATMOSPHERIC PRESET: ${config.atmosPreset.toUpperCase()}
SUBJECT INTEGRITY: ACTIVE (SUBJECT PURGE ENABLED)
`;

  const rawPrompt = `
━━━━━━━━━━━━━━━━ SUBJECT ━━━━━━━━━━━━━━━━

Preserve SUBJECT identity, natural facial structure, realistic proportions, and natural asymmetry.

SUBJECT:
${subject}
${outfitSection}
${multiSubjectSection}
${strategyLockSection}

${buildAnatomyGeometryAuthority()}

${buildRelativeScalePerceptionLock()}

${buildFacialIdentityAuthority()}

${buildPoseAuthorityIsolationLock()}

${buildEnvironmentalRelightingLock()}

${buildFacialRelightReconstructionLock()}

━━━━━━━━━━━━━━━━ HEAD BODY PROPORTION LOCK ━━━━━━━━━━━━━━━━

Facial identity preservation does not override anatomical scale consistency.

The head must remain proportionally consistent with:

- body frame
- shoulder width
- body mass
- height
- torso volume

Preserve identity.

Do NOT preserve independent head scale.

Head dimensions must adapt to the generated anatomy.

FORBIDDEN:

- oversized head
- undersized body beneath preserved head
- head dominating body proportions
- facial identity causing scale distortion

━━━━━━━━━━━━━━━━ NECK SHOULDER CONTINUITY LOCK ━━━━━━━━━━━━━━━━

The head, neck, trapezius, clavicle span, and shoulders must be constructed as one continuous anatomy system.

Do not construct the head independently from the body.

Neck dimensions must be physically consistent with:

- body frame
- shoulder width
- body mass
- build type

If body frame is large:
- neck thickness must increase substantially
- trapezius volume must manifest with broad curvature
- shoulder root mass must increase to match large torso volume
- skeletal frame must visibly displace more space than average

If shoulder width is broad:
- clavicle span must visibly widen into square/broad structure
- shoulder transition must manifest with robust muscular/skeletal mass
- deltoid curvature must be prominent and wide
- prevent narrow or average shoulder hallucination

FORBIDDEN:

- large head with narrow neck
- large head with average shoulders
- stocky face with slim neck
- broad shoulder metadata without visible clavicle width
- disconnected head-to-body transition

━━━━━━━━━━━━━━━━ IDENTITY EMBEDDING LOCK ━━━━━━━━━━━━━━━━

SUBJECT identity must participate in anatomy generation organically.

Do NOT construct anatomy first and identity later.

FORBIDDEN PIPELINE (CAUSES FACESWAP):
STEP 1 anatomy
STEP 2 body
STEP 3 face insertion / replacement
STEP 4 identity overlay

The SUBJECT identity must influence from the very beginning:
- skull dimensions
- jaw structure
- cheek volume
- neck transition
- trapezius shape
- shoulder root geometry

IDENTITY CONSTRUCTION RULE (CRITICAL FOR UNIFICATION):
Generate the person as ONE inseparable biological individual.

Do not generate:
- a body first
- a face first

Generate simultaneously as a single structure:
- skull
- neck
- trapezius
- shoulders
- torso

The face must emerge naturally from the anatomy with continuous skin geometry.
The skin lighting, texture, and shadows MUST blend seamlessly across the jawline and neck.

FORBIDDEN:
- identity attachment
- identity overlay
- facial insertion
- face grafting
- face replacement
- portrait-to-body composition
- visible seam between face and neck

━━━━━━━━━━━━━━━━ CRITICAL UNIFICATION (TEMPELAN PREVENTION) ━━━━━━━━━━━━━━━━

A fatal error occurs if the subject looks like a "faceswap", "tempelan", or "sticker".
To absolutely prevent this:
1. The face, neck, and chest MUST share the exact same skin micro-texture, pore density, and skin color variation.
2. The lighting on the face MUST physically cast correct shadows down onto the neck and clavicle.
3. The jawline MUST NOT have a hard cut-out edge or glowing out-of-place rim light.
4. If there is a shadow under the chin, it MUST fall naturally onto the neck following the SCENE lighting angle.
5. Generate the entire human (head+body) organically as one mesh. Never superimpose or blend two different photos together.

━━━━━━━━━━━━━━━━ HEAD-BODY UNIFICATION LOCK ━━━━━━━━━━━━━━━━

The face, skull, jaw, neck, clavicle, trapezius,
shoulders, and upper torso must be generated
simultaneously as one continuous anatomy system.

SUBJECT controls identity.
ANATOMY_AUTHORITY controls anatomy.

STRICT CONSTRUCTION RULE:
The anatomy and identity MUST be generated together in a single pass.
Do not construct the body first and apply the face later.
Identity embedding must influence the structural generation of the neck and shoulders.

The neck must physically support the generated skull organically.
The shoulders must physically support the generated neck.
Skin texture, lighting, and shadow gradients must flow seamlessly from the face, down the neck, to the collarbones without any visible boundaries or seams.

CRITICAL AVOIDANCE (FACESWAP PREVENTION):
Any appearance of a "cut and paste" head, floating head, or mismatched skin tones between the face and neck is a critical failure. The transition area (jawline and neck) must be physically coherent, casting natural geometric shadows consistent with the SCENE lighting.

FORBIDDEN:
- face pasted onto body
- portrait attached to body
- detached neck
- disconnected jawline
- floating head appearance
- facial overlay
- facial insertion
- head replacement effect
- visible face/neck seam
- disjointed lighting between head and body

━━━━━━━━━━━━━━━━ BODY ━━━━━━━━━━━━━━━━

Generate a realistic full-body anatomy matching SUBJECT identity and BODY SOURCE OF TRUTH.

The generated body MUST:
- match the physical build defined by ANATOMY AUTHORITY
- maintain realistic proportions independent of SCENE
- preserve natural posture with realistic mass distribution
- appear physically grounded with precise floor/furniture contact

━━━━━━━━━━━━━━━━ SPATIAL COLLISION & DEPTH LOCK ━━━━━━━━━━━━━━━━

Maintain strict spatial awareness regarding SCENE geometry.

Subject MUST:
- Respect all physical boundaries (railings, walls, stairs, bulkheads)
- Avoid clipping through or overlapping scene architecture
- Align feet/body contact points precisely with scene surfaces
- Maintain consistent perspective depth relative to surrounding objects

━━━━━━━━━━━━━━━━ ACCESSORY AUTHORITY ━━━━━━━━━━━━━━━━

Generate only those accessories explicitly defined by SUBJECT, OUTFIT, or ANATOMY_AUTHORITY. 

Independent of SCENE, construct:
- any required eyewear, headwear, or jewelry
- all garment and clothing details

STRICT INHERITANCE BAN (Zero inheritance from SCENE regarding):
- Sunglasses / Eyewear
- Watches, rings, necklaces, bracelets, tattoos
- Bags, hats

PERMITTED SCENE OBJECTS:
- The subject MAY interact with objects originating from the MAIN_SCENE (e.g., holding a glass, vape, or phone) ONLY IF those objects were present in the original scene and do not conflict with the TARGET_SUBJECT's geometry.
- If an object is resting on or held by the original subject in the SCENE, the new subject may be generated holding it naturally.

Avoid:
- inherited body shape
- inherited body proportions
- inherited accessories
- body continuation from SCENE

${buildCriticalValidation()}

━━━━━━━━━━━━━━━━ ANATOMY AUTHORITY SUMMARY ━━━━━━━━━━━━━━━━

${anatomy}

━━━━━━━━━━━━━━━━ COMPOSITION ━━━━━━━━━━━━━━━━

Preserve natural photographic composition while allowing fresh body positioning and realistic posture variation.

━━━━━━━━━━━━━━━━ SCENE ━━━━━━━━━━━━━━━━

Match environment perspective, depth, atmosphere, and realism.

━━━━━━━━━━━━━━━━ LIGHTING ━━━━━━━━━━━━━━━━

Match natural environmental lighting, shadow softness, skin response, and realistic edge integration.

━━━━━━━━━━━━━━━━ OUTPUT ━━━━━━━━━━━━━━━━

One realistic photograph with one believable real person naturally integrated into the scene.
`;

  const compressed = compressPromptAttention(rawPrompt);
  const reduced = promptMassReducer(compressed);
  const converted = visualLanguageConverter(reduced);
  return collapsePromptMass(converted);
}

