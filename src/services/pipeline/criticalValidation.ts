/**
 * @project Remix: Subject Replacement Labs
 * @version 5.1.0
 * @description PHASE D51 - CRITICAL VALIDATION CENTRALIZATION
 */

export function buildCriticalValidation(): string {
  return `━━━━━━━━━━━━━━━━ CRITICAL VALIDATION ━━━━━━━━━━━━━━━━

### ANATOMY & BODY VALIDATION
VALIDATION FAIL IF:
* height/weight/frame/shoulder dimensions do not match the values defined in ANATOMY_AUTHORITY.
* physical frame fails to geometrically displace the amount of space required by the specified ANATOMY_AUTHORITY setting.
* body resembles MAIN_SCENE human in mass, silhouette, or topology.
* body volume/dimensions can be explained by legacy SCENE data instead of ANATOMY_AUTHORITY.
* accessories match scene subject (sunglasses, watches, hats).
* subject clips through, overlaps, or improperly interacts with SCENE geometry (stairs, railings, furniture).

PASS ONLY IF:
* an independent observer can visually infer intended body frame, mass, shoulder width, and overall scale from the anatomy alone.
* generated dimensions visibly reflect all ANATOMY_AUTHORITY parameters without dilution.
* subject appears physically bounded by the scene's geometry.

### FACIAL IDENTITY & EYEWEAR VALIDATION
VALIDATION FAIL IF:
* JAWLINE/FACE SHAPE INHERITANCE: The generated jawline, chin, or overall face silhouette matches the original person in the MAIN_SCENE instead of the TARGET_SUBJECT (CRITICAL FAIL).
* EYEWEAR MISMATCH: Subject in reference has glasses, but generated image is missing glasses (CRITICAL FAIL).
* EYEWEAR MISMATCH: Subject in reference does NOT have glasses, but generated image has glasses added (CRITICAL FAIL).
* facial hair (moustache/beard) or eyebrows appear stronger, denser, or thicker than SUBJECT.
* facial features appear enhanced, beautified, or reinterpreted compared to SUBJECT reference.
* skin integrity is compromised (pores reduced, acne removed, asymmetry corrected).
* identity matches a generic "AI" look or blends traits of multiple people instead of SUBJECT's specific biological data.

PASS ONLY IF:
* facial attributes, eyewear (glasses), hair styling, and micro-textures exactly match SUBJECT with zero enhancement.

### INTEGRATION & LIGHTING VALIDATION
VALIDATION FAIL IF:
* face/body lighting mismatch (brightness, color temp, or source direction).
* face appears independently illuminated, pasted, or composited.
* lighting carryover from SUBJECT source image is observable.

PASS ONLY IF:
* subject appears physically illuminated by the SCENE lighting conditions.

### RECONSTRUCTION VALIDATION
VALIDATION FAIL IF:
* generated geometry/clothing/accessories can be visually traced back to original scene human.
* final subject appears as a modification or variation of the existing person.

PASS ONLY IF:
* subject appears constructed independently in a previously empty placement zone.

### HEAD-BODY UNIFICATION VALIDATION
VALIDATION FAIL IF:
* head appears disproportionately large, visually detached, or dominates body proportions.
* neck volume fails to physically support head mass or appears undersized for body frame.
* observer can identify a head-body boundary or separate face from body generation.

PASS ONLY IF:
* head, neck, and shoulders appear generated as a single, coherent anatomical system matching ANATOMY_AUTHORITY.`;
}
