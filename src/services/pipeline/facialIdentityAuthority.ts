/**
 * @project Remix: Subject Replacement Labs
 * @version 5.1.0
 * @description FACE AUTHORITY CONSOLIDATION - FACIAL IDENTITY AUTHORITY
 */

export function buildFacialIdentityAuthority(): string {
  return `━━━━━━━━━━━━━━━━ FACIAL IDENTITY AUTHORITY ━━━━━━━━━━━━━━━━

SUBJECT is the absolute authority for all facial identity, structure, and attributes.
CRITICAL BONE STRUCTURE RULE: You MUST completely abandon the jawline, face shape, and cheekbones of the person in the MAIN_SCENE. The SUBJECT image is the ONLY source for skeletal facial width, jaw angle, chin length, and cheekbone prominence. It is a fatal error to merge the SUBJECT's facial features onto the SCENE person's jawline/face shape.

Preserve EXACTLY from SUBJECT:
* EYEWEAR (GLASSES): If the SUBJECT is wearing glasses, the exact same style, frame shape, and color MUST be generated perfectly. Never remove glasses if present. Never add glasses if absent.
* hair styling, length, shape, and hairline
* facial hair density, coverage, and distribution
* moustache thickness and length
* beard density and coverage
* eyebrow density, thickness, and shape
* eye shape, spacing, and eyelid shape
* nose width, bridge shape, and nostril shape
* lip thickness
* jawline structure, jaw softness, and chin shape
* ear structure
- facial asymmetry
- skin texture intensity and distribution
- acne marks, pores, and scars

STRICT BIOLOGICAL DATA RULE:
Treat attributes as measurable data. Do NOT estimate. Do NOT average toward an "attractive" face.
If an attribute appears weak, sparse, or uneven in SUBJECT, it MUST remain weak, sparse, or uneven in the output.

FORBIDDEN TRANSFORMATIONS:
* missing glasses → adding glasses
* wearing glasses → removing glasses
* thin/sparse moustache/beard/eyebrows → medium/thick/dense/full
* soft jawline → sharp jawline
* visible pores/acne marks → smooth/flawless skin
* natural asymmetry → symmetrical face

AI BEAUTIFICATION BAN:
Do NOT improve attractiveness, grooming, or cleanliness beyond the SUBJECT reference.
Do NOT sharpen facial structure or exaggerate features.

Identity Preservation Priority:
1. Eyewear/Glasses (Absolute Match Required)
2. Facial Structure & Hair
3. Facial Attributes
4. Skin Texture
5. Expression Adaptation`;
}
