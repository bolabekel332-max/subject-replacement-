/**
 * @project Remix: Subject Replacement Labs
 * @version 1.1.0
 * @description PHASE D50.2 - MASTER PHOTO LOCK
 */

export function buildSceneImmutabilityLock(): string {
  return `
MASTER PHOTO LOCK (ENFORCED):
Treat MAIN_SCENE as a completed master photograph. The generation objective is PHOTO EDITING, not scene recreation. 
The environment outside the inserted subject must remain IDENTICAL to the source.

PRESERVE EXACTLY (PIXEL PRESERVATION PRIORITY):
- Architecture, wall patterns, floor materials, and ceiling details.
- All furniture (design, placement, texture).
- Landscape, skyline, clouds, and background vegetation.
- Existing environment geometry, floor planes, and railing structures.
- Camera framing, crop, horizon position, and vanishing point perspective.
- Exact camera position and focal length characteristics.

FORBIDDEN (ENVIRONMENT REGENERATION BAN):
- DO NOT recreate or "visually similar" reproduce the environment.
- DO NOT redesign or reinterpret background architecture or structures.
- DO NOT alter composition, framing, or camera zoom levels.
- DO NOT modify the skyline or landscape beyond the subject's silhouette boundaries.
- NO scene re-photography or architectural interpolation.

EDITING SCOPE (AUTHORIZED ONLY):
- Insert NEW TARGET_SUBJECT into the master photograph.
- Generate accurate subject shadows and contact interaction.
- Apply local lighting adaptation (light wrap, ambient occlusion) ONLY on and around the subject.
- Ensure the subject integrates seamlessly into the UNCHANGED source photograph.
`.trim();
}
