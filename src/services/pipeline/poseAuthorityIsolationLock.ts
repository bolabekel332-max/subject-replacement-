/**
 * @project Remix: Subject Replacement Labs
 * @version 1.0.0
 * @description PHASE D51 - POSE AUTHORITY ISOLATION LOCK
 */

export function buildPoseAuthorityIsolationLock(): string {
  return `━━━━━━━━━━━━━━━━ POSE AUTHORITY ISOLATION LOCK ━━━━━━━━━━━━━━━━

Visible human posture in SCENE must not be interpreted as skeletal authority.
SCENE human joint positions are invalid.

Invalid:
- shoulder angle
- elbow angle
- wrist angle
- hip angle
- knee angle
- foot placement

Generate a new skeletal system from SUBJECT and ANATOMY_AUTHORITY only.

SCENE may define:
- placement area
- perspective
- camera relation

SCENE may NOT define:
- skeletal structure
- joint alignment
- body balance
- body posture

━━━━━━━━━━━━━━━━ ANATOMY SCALE ENFORCEMENT ━━━━━━━━━━━━━━━━

Height and body mass are physical constraints.
Do not interpret them as descriptive traits.

Construct body dimensions physically consistent with:
- height reference
- weight reference
- body frame
- shoulder width
- torso ratio
- leg proportion

Validation fail if body scale appears average when ANATOMY_AUTHORITY specifies extreme values.

━━━━━━━━━━━━━━━━ GARMENT GEOMETRY LOCK ━━━━━━━━━━━━━━━━

Clothing visible in SCENE must not be used as garment authority.
Reject inheritance of:
- garment silhouette
- garment volume
- garment fit
- garment tension
- garment folds
- garment drape
- garment compression

Generate clothing geometry from SUBJECT and generated anatomy only.`.trim();
}
