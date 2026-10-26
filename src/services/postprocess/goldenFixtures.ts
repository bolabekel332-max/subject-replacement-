/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FinalizePipelineContext } from '../../App';
import { CoverageOverride } from '../reconciliation/detectionReconciler';

export interface GoldenTestCase {
  id: string;
  name: string;
  description: string;
  reconciliation: {
    data: any;
    replacementCoverageOverride?: CoverageOverride;
  };
  context: FinalizePipelineContext;
  expected: {
    shouldHaveChatTrigger?: boolean;
    expectedTriggerEnglishTokens?: string[];
    forbiddenIndonesianTokens?: string[];
    expectedIdentityTraits?: string[];
    forbiddenMetaTokens?: string[];
    forbiddenHallucinatedTokens?: string[];
  };
}

export function createDefaultContext(overrides: Partial<FinalizePipelineContext> = {}): FinalizePipelineContext {
  return {
    mainDetection: {
      subjects: [{
        bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 },
        confidence: 0.95,
        type: 'person'
      }],
      primary: {
        bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 },
        confidence: 0.95,
        type: 'person'
      }
    },
    replacementDetection: {
      subjects: [{
        bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 },
        confidence: 0.95,
        type: 'person'
      }],
      primary: {
        bbox: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 },
        confidence: 0.95,
        type: 'person'
      }
    },
    mainPose: null,
    replacementPose: null,
    mainFileName: 'scene_main.jpg',
    replacementFileName: 'subject_ref.jpg',
    outfitFileName: '',
    outfitImage: null,
    targetPoseMode: 'NATURAL' as any,
    targetEnvPreset: 'DAYLIGHT' as any,
    targetAtmosPreset: 'NONE' as any,
    anatomyProfile: null,
    targetMode: 'nano',
    cleanedScene: 'data:image/jpeg;base64,placeholderCleanedScene',
    reconstructedScene: 'data:image/jpeg;base64,placeholderReconstructed',
    isMultiSubject: false,
    targetSubjectRole: '',
    targetStyle: 'realistic',
    autoLightingStr: 'Natural daylight (DAYLIGHT)',
    sanitize: (text: string) => text.trim(),
    attributes: 'female, professional attire, standing',
    chatTrigger: undefined,
    ...overrides
  };
}

/**
 * 5–10 Canned Test Cases for Deterministic Golden Set Regression
 */
export const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  // --- Case 1: Wikimedia Repro Pair (Blue Blazer Man Scene + Laptop Woman Subject) ---
  {
    id: 'case_1_wikimedia_repro',
    name: 'Wikimedia Repro Pair: Blue Blazer Man Scene + Laptop Woman Subject',
    description: 'Represents the canonical Wikimedia repro pair: outdoor street scene with man in blue blazer, replaced by professional woman holding laptop.',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'natural sunlight, soft ambient shadows',
          angle: 'eye-level medium shot',
          environment: 'urban street background with modern architecture'
        },
        prompts: {
          prompt: 'A professional woman holding a laptop in an urban street, natural daylight',
          face_shape: 'oval face',
          hair: 'shoulder-length brown hair',
          expression: 'focused professional expression',
          skin_tone: 'fair skin',
          pose: 'standing upright holding laptop',
          outfit: 'smart casual blazer and blouse',
          lighting_type: 'natural sunlight',
          color_tones: 'natural street palette'
        },
        simulation: 'A professional woman stands on a sunny urban sidewalk holding a laptop, illuminated by soft natural daylight matching the street environment.'
      },
      replacementCoverageOverride: { coverage: 'HALF_BODY', logic: 'Mid-torso laptop framing' }
    },
    context: createDefaultContext({
      mainFileName: 'wikimedia_man_blue_blazer.jpg',
      replacementFileName: 'wikimedia_woman_laptop.jpg',
      targetMode: 'nano',
      autoLightingStr: 'natural sunlight, soft ambient shadows'
    }),
    expected: {
      expectedIdentityTraits: ['oval face', 'shoulder-length brown hair', 'focused professional expression'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  },

  // --- Case 2: Chat Trigger (Indonesian Aviator Directive) ---
  {
    id: 'case_2_chat_trigger_aviator',
    name: 'Chat Trigger Directive: "subjek memakai kacamata hitam aviator"',
    description: 'Tests deterministic conversion of Indonesian accessory trigger into English semantic tokens in prompt body without raw Indonesian residue.',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'bright daylight, clear sky',
          angle: 'eye level shot',
          environment: 'coastal boulevard'
        },
        prompts: {
          prompt: 'A stylish person in a coastal boulevard, natural daylight',
          face_shape: 'sharp jawline',
          hair: 'short black hair',
          expression: 'confident calm expression',
          skin_tone: 'tan skin',
          pose: 'walking casually',
          outfit: 'white linen shirt and dark trousers',
          lighting_type: 'direct sunlight',
          color_tones: 'warm coastal palette'
        },
        simulation: 'A confident person walks along a sunlit coastal promenade wearing casual attire.'
      },
      replacementCoverageOverride: { coverage: 'FULL_BODY', logic: 'Full length walking view' }
    },
    context: createDefaultContext({
      mainFileName: 'coastal_scene.jpg',
      replacementFileName: 'stylish_subject.jpg',
      targetMode: 'nano',
      chatTrigger: 'subjek memakai kacamata hitam aviator'
    }),
    expected: {
      shouldHaveChatTrigger: true,
      expectedTriggerEnglishTokens: ['black aviator sunglasses'],
      forbiddenIndonesianTokens: ['kacamata', 'hitam', 'memakai', 'subjek'],
      expectedIdentityTraits: ['short black hair', 'confident calm expression'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  },

  // --- Case 3: Fully Populated Identity Traits ---
  {
    id: 'case_3_full_identity_traits',
    name: 'Full Identity Traits: Complete Level-1 Profile',
    description: 'Tests that all three Level-1 identity traits (face_shape, hair, expression) are preserved and injected into prompt body.',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'soft window light with subtle rim reflection',
          angle: 'close-up portrait angle',
          environment: 'modern art studio with wooden easel and neutral walls'
        },
        prompts: {
          prompt: 'Close portrait of a creative individual in an artist studio',
          face_shape: 'heart-shaped face',
          hair: 'long wavy dark brown hair',
          expression: 'warm gentle smile',
          skin_tone: 'warm olive skin',
          pose: 'seated resting chin on hand',
          outfit: 'artist canvas apron over dark turtleneck',
          lighting_type: 'diffuse window illumination',
          color_tones: 'warm earthy tones'
        },
        simulation: 'A person with a warm gentle smile sits near a window in a softly lit studio with natural wooden highlights.'
      },
      replacementCoverageOverride: { coverage: 'HALF_BODY', logic: 'Portrait framing' }
    },
    context: createDefaultContext({
      mainFileName: 'art_studio.jpg',
      replacementFileName: 'portrait_ref.jpg',
      targetMode: 'nano',
      autoLightingStr: 'soft window light'
    }),
    expected: {
      expectedIdentityTraits: ['heart-shaped face', 'long wavy dark brown hair', 'warm gentle smile'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  },

  // --- Case 4: Simulation Meta Guard ---
  {
    id: 'case_4_simulation_meta_guard',
    name: 'Simulation Meta Guard: Purging Internal AI Instructions',
    description: 'Tests simulation guard when AI response returns internal engine meta keywords instead of visual scene description.',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'warm indoor ambient lighting',
          angle: 'medium shot eye level',
          environment: 'cozy bookstore with wooden bookshelves'
        },
        prompts: {
          prompt: 'A person browsing books in a library, warm ambient light',
          face_shape: 'round face',
          hair: 'curly auburn hair',
          expression: 'curious thoughtful gaze',
          skin_tone: 'fair skin',
          pose: 'reaching for a hardcover book on high shelf',
          outfit: 'cable-knit wool sweater',
          lighting_type: 'warm tungsten lamp',
          color_tones: 'rich amber tones'
        },
        // Meta instruction that must be sanitized / replaced by deterministic simulation
        simulation: 'EXECUTION STRATEGY & LOCK\nPOSE CONTROL ENGINE: NATURAL\nANATOMY AUTHORITY: AUTO\nVISUAL SIMULATION\nPARAMETER LOCK: ACTIVE'
      },
      replacementCoverageOverride: { coverage: 'HALF_BODY', logic: 'Standard bookstore view' }
    },
    context: createDefaultContext({
      mainFileName: 'library_scene.jpg',
      replacementFileName: 'reader_ref.jpg',
      targetMode: 'nano',
      autoLightingStr: 'warm indoor ambient lighting'
    }),
    expected: {
      expectedIdentityTraits: ['curly auburn hair', 'curious thoughtful gaze'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  },

  // --- Case 5: Angle & Lighting Conflict Resolution ---
  {
    id: 'case_5_conflict_sanitization',
    name: 'Sanitizer Conflict Resolution: Mutually Exclusive Angles & Lighting',
    description: 'Tests conflict sanitizer when prompt has conflicting angles (eye level vs low angle) and lighting (sunlight vs neon).',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'bright afternoon sunlight',
          angle: 'eye level shot',
          environment: 'public park with green trees and gravel pathway'
        },
        prompts: {
          prompt: 'A person standing in a park, eye level shot, captured from low angle view, bright afternoon sunlight, moody neon rim lighting',
          face_shape: 'oval face',
          hair: 'straight black hair',
          expression: 'neutral relaxed expression',
          skin_tone: 'medium skin',
          pose: 'standing with arms folded',
          outfit: 'green parka and denim jeans',
          lighting_type: 'bright afternoon sunlight',
          color_tones: 'vibrant outdoor green'
        },
        simulation: 'A relaxed person stands outdoors on a gravel path under bright afternoon sunlight.'
      },
      replacementCoverageOverride: { coverage: 'FULL_BODY', logic: 'Park view full shot' }
    },
    context: createDefaultContext({
      mainFileName: 'park_scene.jpg',
      replacementFileName: 'person_ref.jpg',
      targetMode: 'nano',
      autoLightingStr: 'bright afternoon sunlight'
    }),
    expected: {
      expectedIdentityTraits: ['straight black hair'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  },

  // --- Case 6: Multi-Subject Bystander Lock ---
  {
    id: 'case_6_multi_subject_isolation',
    name: 'Multi-Subject Isolation: Preserving Bystander Immobility',
    description: 'Tests multi-subject scene where target role is isolated without mutating background bystanders.',
    reconciliation: {
      data: {
        analysis: {
          lighting: 'diffused morning daylight',
          angle: 'wide street level shot',
          environment: 'busy pedestrian crossing with several pedestrians'
        },
        prompts: {
          prompt: 'A pedestrian waiting at a pedestrian crosswalk, morning daylight',
          face_shape: 'square jaw',
          hair: 'neat parted dark hair',
          expression: 'patient attentive look',
          skin_tone: 'tan skin',
          pose: 'standing still waiting for green light',
          outfit: 'gray trench coat',
          lighting_type: 'diffused morning daylight',
          color_tones: 'cool morning palette'
        },
        simulation: 'The target pedestrian stands quietly at the crosswalk surrounded by natural urban morning activity.'
      },
      replacementCoverageOverride: { coverage: 'FULL_BODY', logic: 'Wide street shot' }
    },
    context: createDefaultContext({
      mainFileName: 'busy_crossing.jpg',
      replacementFileName: 'new_pedestrian.jpg',
      isMultiSubject: true,
      targetSubjectRole: 'pedestrian on the left in dark trench coat',
      targetMode: 'nano',
      autoLightingStr: 'diffused morning daylight'
    }),
    expected: {
      expectedIdentityTraits: ['neat parted dark hair', 'patient attentive look'],
      forbiddenMetaTokens: ['EXECUTION STRATEGY', 'LOCK', 'ENGINE', 'AUTHORITY', 'PARAMETER'],
      forbiddenHallucinatedTokens: ['nightclub', 'dj booth']
    }
  }
];
