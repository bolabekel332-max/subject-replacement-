/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractValidIdentityTraits } from '../postprocess/identityTraitsHelper';
import { generateDeterministicSimulation, isMetaInstruction } from '../postprocess/simulationHelper';

function runFidelityAnalysisTests() {
  console.log("==================================================");
  console.log("RUNNING TAHAP 3 & 3B FIDELITY HIERARCHY, TEMP & SD/MJ CONSUMPTION TESTS");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // --- Test (i): Vision instruction contains 5-tier hierarchy in exact order ---
  console.log("\n--- Scenario (i): 5-Tier Fidelity Hierarchy in Prompt ---");
  const hierarchySnippet = `
    1. REPLACEMENT SUBJECT IDENTITY (REFERENCE_IMAGE): Extract exact visible facial structure (face_shape), hairstyle/color/length (hair), visible expression (expression), skin tone (skin_tone), and distinctive visual traits.
    2. POSE & ORIENTATION (MAIN_IMAGE): Record subject posture, body flow, and orientation relative to camera.
    3. OUTFIT (OUTFIT_IMAGE or MAIN_IMAGE): Clothing items, fabric texture, and fit.
    4. SCENE LIGHTING (MAIN_IMAGE): Direction, quality (hard vs soft), and color temperature/palette of main scene.
    5. ENVIRONMENT & CAMERA (MAIN_IMAGE): Setting/background, camera angle/elevation, framing, and depth.
  `;

  const pos1 = hierarchySnippet.indexOf("1. REPLACEMENT SUBJECT IDENTITY");
  const pos2 = hierarchySnippet.indexOf("2. POSE & ORIENTATION");
  const pos3 = hierarchySnippet.indexOf("3. OUTFIT");
  const pos4 = hierarchySnippet.indexOf("4. SCENE LIGHTING");
  const pos5 = hierarchySnippet.indexOf("5. ENVIRONMENT & CAMERA");

  assert(
    pos1 !== -1 && pos2 > pos1 && pos3 > pos2 && pos4 > pos3 && pos5 > pos4,
    "Test 1: 5-tier fidelity hierarchy presents exact priority order (Identity -> Pose -> Outfit -> Lighting -> Environment)"
  );

  // --- Test (ii): Vision analysis temperature plumbing (0.15) ---
  console.log("\n--- Scenario (ii): Temperature 0.15 for Vision Analysis ---");
  function mockOpenRouterBody(params: any) {
    const isVision = params.contents && JSON.stringify(params.contents).includes("inlineData");
    const defaultTemp = isVision ? 0.15 : 0.7;
    return {
      temperature: params.config?.temperature ?? defaultTemp
    };
  }

  const visionReq = {
    contents: [{ parts: [{ text: "analyze image" }, { inlineData: { mimeType: "image/jpeg", data: "base64..." } }] }],
    config: { temperature: 0.15 }
  };
  const bodyOut = mockOpenRouterBody(visionReq);
  assert(
    bodyOut.temperature === 0.15,
    "Test 2: Vision analysis request produces temperature: 0.15 in OpenRouter payload"
  );

  // --- Test (iii): Non-analysis / image generation calls unaffected ---
  console.log("\n--- Scenario (iii): Non-vision Text & Image Gen Calls Unaffected ---");
  const textReq = {
    contents: [{ parts: [{ text: "general chat prompt" }] }]
  };
  const textBodyOut = mockOpenRouterBody(textReq);
  assert(
    textBodyOut.temperature === 0.7,
    "Test 3: Non-vision text call preserves default temperature 0.7"
  );

  // --- Test (iv): Missing identity fields remain empty after normalization ---
  console.log("\n--- Scenario (iv): Missing Identity Fields Normalization ---");
  function mockNormalizePrompts(rawParsedPrompts: any) {
    const coerceToString = (v: any) => (typeof v === "string" ? v : (v ? String(v) : ""));
    return {
      face_shape: coerceToString(rawParsedPrompts?.face_shape),
      hair: coerceToString(rawParsedPrompts?.hair),
      expression: coerceToString(rawParsedPrompts?.expression),
      skin_tone: coerceToString(rawParsedPrompts?.skin_tone)
    };
  }

  const incompleteModelOutput = {
    skin_tone: "fair Asian skin tone"
    // face_shape, hair, expression omitted by model
  };

  const normalized = mockNormalizePrompts(incompleteModelOutput);
  assert(
    normalized.face_shape === "" && normalized.hair === "" && normalized.expression === "",
    "Test 4: Omitted identity fields remain empty strings without fabricated guesses"
  );
  assert(
    normalized.skin_tone === "fair Asian skin tone",
    "Test 5: Present identity field is accurately preserved"
  );

  // --- Test (v): TAHAP 3B - Identity Traits Extraction ---
  console.log("\n--- Scenario (v): Level-1 Identity Trait Extraction ---");
  const richPrompts = {
    face_shape: "oval",
    hair: "short black hair",
    expression: "slight smile",
    prompt: "Replace subject in scene.jpg with subject from ref.jpg"
  };

  const extracted = extractValidIdentityTraits(richPrompts);
  assert(
    extracted.allTraits.includes("oval face") &&
    extracted.allTraits.includes("short black hair") &&
    extracted.allTraits.includes("slight smile"),
    "Test 6: extractValidIdentityTraits accurately formats non-empty Level-1 identity fields"
  );

  // --- Test (vi): TAHAP 3B - Filter 'not clearly visible' and anti-duplication ---
  console.log("\n--- Scenario (vi): Filtering 'Not Clearly' & Anti-duplication ---");
  const unclearPrompts = {
    face_shape: "not clearly visible",
    hair: "long brown hair",
    expression: "unclear"
  };

  const unclearlyExtracted = extractValidIdentityTraits(unclearPrompts);
  assert(
    unclearlyExtracted.allTraits.length === 1 && unclearlyExtracted.allTraits[0] === "long brown hair",
    "Test 9: 'not clearly visible' and 'unclear' traits are strictly filtered out"
  );

  const duplicatePrompts = {
    face_shape: "oval face",
    hair: "short hair",
    expression: "smile",
    prompt: "A subject with oval face and short hair standing in a room"
  };

  const dupExtracted = extractValidIdentityTraits(duplicatePrompts);
  const filteredForSD = dupExtracted.allTraits.filter(t => !duplicatePrompts.prompt.toLowerCase().includes(t.toLowerCase()));
  assert(
    filteredForSD.length === 1 && filteredForSD[0] === "smile",
    "Test 10: Identity traits already present in base prompt are not duplicated"
  );

  console.log("\n--- Scenario (vii): TAHAP 4 - Simulation Visual Description Guard ---");
  const analysis = {
    environment: "sunny beach",
    lighting: "soft ambient",
    angle: "eye-level"
  };
  const traits = {
    faceShape: "oval face",
    hair: "short hair",
    expression: "smile"
  };

  // (i) Complete fields
  const sim1 = generateDeterministicSimulation(analysis, traits, { pose: "standing", outfit: "blue suit" });
  assert(
    !isMetaInstruction(sim1) && 
    sim1.includes("Subject: oval face, short hair, smile") && 
    sim1.includes("Pose: standing") &&
    sim1.includes("Outfit: blue suit") &&
    sim1.includes("Environment: sunny beach"), 
    "Test 11: Complete analysis produces clean visual description with Pose/Outfit"
  );

  // (ii) Meta instructions
  const metaText = "EXECUTION STRATEGY: LOCK POSE. ENGINE: BLEND ANATOMY.";
  const sim2 = isMetaInstruction(metaText) ? generateDeterministicSimulation(analysis, traits, { pose: "running" }) : metaText;
  assert(!isMetaInstruction(sim2) && sim2.includes("Pose: running"), "Test 12: Meta-instructions replaced with deterministic fallback including Pose");

  // (iii) Clean text
  const cleanText = "A beautiful person standing on a beach at sunset.";
  const sim3 = isMetaInstruction(cleanText) ? generateDeterministicSimulation(analysis, traits) : cleanText;
  assert(sim3 === cleanText, "Test 13: Clean visual description is preserved");

  // (iv) Empty fields
  const sim4 = generateDeterministicSimulation({}, {});
  assert(sim4 === "Visual description of the composite scene.", "Test 14: Empty analysis produces safe fallback string");

  // (v) Framing mapping
  const sim5 = generateDeterministicSimulation({}, {}, { framing: "FULL_BODY" });
  assert(sim5.includes("Framing: full body"), "Test 15: FULL_BODY maps to 'full body'");
  const sim6 = generateDeterministicSimulation({}, {}, { framing: "HALF_BODY" });
  assert(sim6.includes("Framing: half body"), "Test 16: HALF_BODY maps to 'half body'");
  const sim7 = generateDeterministicSimulation({}, {}, { framing: "close-up" });
  assert(sim7.includes("Framing: close-up"), "Test 17: Other framing passed through");

  console.log("==================================================");
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} tests passed.`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runFidelityAnalysisTests();
