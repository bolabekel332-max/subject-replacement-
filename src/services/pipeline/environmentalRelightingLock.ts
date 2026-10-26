/**
 * @project Remix: Subject Replacement Labs
 * @version 1.0.0
 * @description PHASE D50.5A - ENVIRONMENTAL RELIGHTING LOCK
 */

export function buildEnvironmentalRelightingLock(): string {
  return `━━━━━━━━━━━━━━━━ ENVIRONMENTAL RELIGHTING LOCK ━━━━━━━━━━━━━━━━

The generated subject must be relit using SCENE lighting.

Do not preserve lighting characteristics from SUBJECT reference.

Derive from SCENE:
- dominant light direction and multiple theoretical point sources
- shadow direction, attenuation, and falloff
- shadow softness/hardness (matching scene diffusion)
- highlight intensity and specular reflection shapes
- color temperature and atmospheric scattering
- ambient color bounce and global illumination
- environmental reflections (specular and diffuse)
- depth-of-field masking on lighting edges

Apply to:
- face and micro-contours (pores, wrinkles)
- skin translucency (Subsurface Scattering)
- neck and complex anatomical junctions
- torso and fabric occlusion
- arms/hands and contact surfaces
- clothing (material-specific specularity)

Generate:
- advanced self-shadowing (nose on cheek, chin on neck)
- precise contact shadows on scene geometry and self
- deep ambient occlusion in creases and clothing folds
- accurate environmental color spill from adjacent scene surfaces (floor/walls)
- rim lighting geometry where physically dictated by scene backlighting
- physically based skin reflectance (oily vs dry) matching scene humidity/temperature
- Subsurface Scattering (SSS) on ear cartilage, nose, and fingers under strong backlight

The subject must appear photographed
under the same lighting conditions
as the environment.

FORBIDDEN:
- face lighting from SUBJECT image
- independent portrait lighting
- studio lighting carryover
- isolated facial highlights
- lighting mismatch between face and body`.trim();
}
