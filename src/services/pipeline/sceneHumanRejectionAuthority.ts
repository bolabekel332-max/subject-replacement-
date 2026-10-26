/**
 * @project Remix: Subject Replacement Labs
 * @version 5.1.0
 * @description REDUNDANCY PURGE CONSOLIDATION V1 - SCENE HUMAN REJECTION AUTHORITY
 */

export function buildSceneHumanRejectionAuthority(): string {
  return `━━━━━━━━━━━━━━━━ SCENE HUMAN REJECTION AUTHORITY ━━━━━━━━━━━━━━━━

The original human visible in MAIN_SCENE must be treated as non-existent generation data.

Completely construct all anatomical and clothing data from SUBJECT and ANATOMY_AUTHORITY, ignoring legacy human data in SCENE.

SCENE legacy human data must NOT influence:
* anatomy
* silhouette
* body proportions
* body mass
* skeletal structure
* clothing geometry
* accessories
* pose geometry

SCENE provides ONLY:
* environment
* lighting
* perspective
* depth
* atmosphere
* placement area

Generate a completely new human from:
* SUBJECT
* ANATOMY_AUTHORITY

FORBIDDEN:
* face replacement
* body replacement
* anatomy inheritance
* silhouette inheritance
* clothing inheritance
* accessory inheritance`;
}
