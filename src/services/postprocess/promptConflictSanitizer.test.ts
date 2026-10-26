/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sanitizePromptConflicts, SanitizerContext } from './promptConflictSanitizer';

function runTests() {
  console.log("==================================================");
  console.log("RUNNING TAHAP 2 PROMPT CONFLICT SANITIZER TESTS");
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

  // --- Test (i): Angle conflict (eye-level + low angle) ---
  console.log("\n--- Scenario (i): Camera Angle Conflict ---");
  const angleInput = "A realistic photo of a subject, eye level shot, captured from low angle in a room";
  const angleRes1 = sanitizePromptConflicts(angleInput, { structuredAngle: "eye level" }, "nano");
  assert(
    angleRes1.sanitizedPrompt.includes("eye level shot") && !angleRes1.sanitizedPrompt.includes("low angle"),
    "Test 1: Eye level prioritized over low angle when structured fact is eye level"
  );
  assert(
    angleRes1.logs.some(l => l.includes("low angle") && l.includes("eye level")),
    "Test 2: Angle removal correctly logged with source and winner"
  );

  const angleRes2 = sanitizePromptConflicts(angleInput, { structuredAngle: "low angle" }, "nano");
  assert(
    angleRes2.sanitizedPrompt.includes("low angle") && !angleRes2.sanitizedPrompt.includes("eye level"),
    "Test 3: Low angle prioritized when structured fact specifies low angle"
  );

  // --- Test (ii): Framing conflict (medium shot + full body) ---
  console.log("\n--- Scenario (ii): Framing Coverage Conflict ---");
  const framingInput = "full body shot of subject wearing coat, medium shot, standing in street";
  const framingRes1 = sanitizePromptConflicts(framingInput, { structuredFraming: "FULL_BODY" }, "sd");
  assert(
    framingRes1.sanitizedPrompt.includes("full body shot") && !framingRes1.sanitizedPrompt.includes("medium shot"),
    "Test 4: Full body preserved and medium shot removed when coverage is FULL_BODY"
  );

  const framingRes2 = sanitizePromptConflicts(framingInput, { structuredFraming: "HALF_BODY" }, "sd");
  assert(
    framingRes2.sanitizedPrompt.includes("medium shot") && !framingRes2.sanitizedPrompt.includes("full body"),
    "Test 5: Medium shot preserved when coverage is HALF_BODY"
  );

  // --- Test (iii): Lighting quality conflict (hard directional vs soft diffuse) ---
  console.log("\n--- Scenario (iii): Lighting Quality Conflict ---");
  const lightInput = "subject with directional flash, harsh shadows, soft lighting and diffused ambient";
  const lightRes = sanitizePromptConflicts(lightInput, { structuredLightingQuality: "directional flash" }, "mj");
  assert(
    (lightRes.sanitizedPrompt.includes("directional flash") || lightRes.sanitizedPrompt.includes("harsh shadows")) &&
    !lightRes.sanitizedPrompt.includes("soft lighting") &&
    !lightRes.sanitizedPrompt.includes("diffused ambient"),
    "Test 6: Hard directional lighting preserved while soft diffused tokens are removed"
  );

  // --- Test (iv): Color temperature conflict (warm vs cool, and mixed lighting exception) ---
  console.log("\n--- Scenario (iv): Color Temperature & Mixed Lighting Exception ---");
  const colorInput = "scenery with warm tones and golden hour, cool tones blue hour";
  const colorRes = sanitizePromptConflicts(colorInput, { structuredColorTone: "warm tones" }, "nano");
  assert(
    colorRes.sanitizedPrompt.includes("warm tones") && !colorRes.sanitizedPrompt.includes("cool tones"),
    "Test 7: Warm tones preserved over cool tones when structured color is warm"
  );

  const mixedInput = "a person in a neon club, mixed lighting with cyan lighting and magenta lighting, warm tones";
  const mixedRes = sanitizePromptConflicts(mixedInput, { isMixedLighting: true }, "nano");
  assert(
    mixedRes.sanitizedPrompt.includes("mixed lighting") &&
    mixedRes.sanitizedPrompt.includes("cyan lighting") &&
    mixedRes.sanitizedPrompt.includes("magenta lighting"),
    "Test 8: Mixed lighting exception retains mixed cyan and magenta description without forcing single dominance"
  );

  // --- Test (v): Prompt without conflicts ---
  console.log("\n--- Scenario (v): Conflict-free Prompt ---");
  const cleanInput = "photorealistic, 8k, photorealistic, medium shot, eye level, soft lighting, outdoor nature";
  const cleanRes = sanitizePromptConflicts(cleanInput, {}, "sd");
  assert(
    cleanRes.sanitizedPrompt.split(", ").filter(t => t === "photorealistic").length === 1,
    "Test 9: Identical repeated token 'photorealistic' deduplicated"
  );
  assert(
    cleanRes.sanitizedPrompt.includes("medium shot") && cleanRes.sanitizedPrompt.includes("eye level") && cleanRes.sanitizedPrompt.includes("soft lighting"),
    "Test 10: Non-conflicting tokens preserved intact"
  );

  // --- Test (vi): All 3 engines (Nano, SD, MJ) pass through sanitizer ---
  console.log("\n--- Scenario (vi): Multi-engine Sanitization Verification ---");
  const multiInput = "eye level, low angle, full body, medium shot, hard lighting, soft lighting";
  const nanoOut = sanitizePromptConflicts(multiInput, { structuredAngle: "eye level", structuredFraming: "FULL_BODY" }, "nano");
  const sdOut = sanitizePromptConflicts(multiInput, { structuredAngle: "eye level", structuredFraming: "FULL_BODY" }, "sd");
  const mjOut = sanitizePromptConflicts(multiInput, { structuredAngle: "eye level", structuredFraming: "FULL_BODY" }, "mj");

  assert(
    !nanoOut.sanitizedPrompt.includes("low angle") && !nanoOut.sanitizedPrompt.includes("medium shot"),
    "Test 11: Nano Banana output sanitized successfully"
  );
  assert(
    !sdOut.sanitizedPrompt.includes("low angle") && !sdOut.sanitizedPrompt.includes("medium shot"),
    "Test 12: Stable Diffusion output sanitized successfully"
  );
  assert(
    !mjOut.sanitizedPrompt.includes("low angle") && !mjOut.sanitizedPrompt.includes("medium shot"),
    "Test 13: Midjourney output sanitized successfully"
  );

  console.log("==================================================");
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} tests passed.`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
