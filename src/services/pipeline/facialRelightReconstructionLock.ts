/**
 * @project Remix: Subject Replacement Labs
 * @version 1.0.0
 * @description PHASE D50.6 - FACIAL RELIGHT RECONSTRUCTION LOCK
 */

export function buildFacialRelightReconstructionLock(): string {
  return `━━━━━━━━━━━━━━━━ FACIAL RELIGHT RECONSTRUCTION LOCK ━━━━━━━━━━━━━━━━

The lighting visible on SUBJECT reference images
must be treated as invalid rendering information.

SUBJECT reference may provide:
- facial identity
- facial structure
- skin texture
- facial asymmetry

SUBJECT reference may NOT provide:
- facial lighting
- facial shadows
- facial highlights
- facial exposure
- facial color temperature
- facial contrast

Before final rendering:
remove inherited facial illumination.

Reconstruct facial illumination entirely from SCENE.

Derive from SCENE:
- dominant light direction
- dominant shadow direction
- ambient light level
- color temperature
- reflected environmental light
- local occlusion
- rim light presence

Apply consistently across:
- forehead
- eyes
- cheeks
- nose
- lips
- jawline
- neck

Face and body must share:
- identical light source
- identical exposure behavior
- identical shadow logic
- identical color temperature

FORBIDDEN:
- portrait lighting carryover
- selfie lighting carryover
- source-photo highlights
- source-photo shadow patterns
- isolated facial brightness`.trim();
}
