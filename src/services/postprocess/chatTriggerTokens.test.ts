/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TAHAP 6: CHAT TRIGGER SEMANTIC CONVERTER TESTS
 */

import { translateChatTrigger, formatChatTriggerForEngine } from './chatTriggerTokens';

function runTests() {
  console.log("==================================================");
  console.log("RUNNING TAHAP 6 CHAT TRIGGER TOKEN TESTS");
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

  // --- Test 1: Penanda Utama ---
  // "subjek memakai kacamata hitam aviator"
  console.log("\n--- Scenario 1: Penanda Utama (Aviator Sunglasses) ---");
  const input1 = "subjek memakai kacamata hitam aviator";
  const tokens1 = translateChatTrigger(input1);
  const formattedNano1 = formatChatTriggerForEngine(input1, 'nano');

  console.log(`Input: "${input1}"`);
  console.log(`Tokens:`, tokens1);
  console.log(`Formatted Nano: "${formattedNano1}"`);

  assert(
    tokens1.some(t => t.includes("black aviator sunglasses")),
    "Test 1.1: 'kacamata hitam aviator' accurately translated to 'black aviator sunglasses'"
  );
  assert(
    !tokens1.some(t => /subjek|memakai|kacamata|hitam/i.test(t)),
    "Test 1.2: Zero raw Indonesian residue remaining in output tokens"
  );
  assert(
    formattedNano1.includes("black aviator sunglasses"),
    "Test 1.3: Nano format contains black aviator sunglasses"
  );

  // --- Test 2: Varian Lain ---
  // "rambut sedikit berantakan dan jaket kulit merah"
  console.log("\n--- Scenario 2: Varian Frasa (Hair & Clothing) ---");
  const input2 = "rambut sedikit berantakan dan jaket kulit merah";
  const tokens2 = translateChatTrigger(input2);
  const formattedNano2 = formatChatTriggerForEngine(input2, 'nano');

  console.log(`Input: "${input2}"`);
  console.log(`Tokens:`, tokens2);
  console.log(`Formatted Nano: "${formattedNano2}"`);

  assert(
    tokens2.some(t => t.includes("slightly messy hair")) || tokens2.join(" ").includes("slightly messy hair"),
    "Test 2.1: 'rambut sedikit berantakan' accurately translated to 'slightly messy hair'"
  );
  assert(
    tokens2.some(t => t.includes("leather jacket")) || tokens2.join(" ").includes("leather jacket"),
    "Test 2.2: 'jaket kulit' accurately translated to 'leather jacket'"
  );
  assert(
    !tokens2.some(t => /rambut|sedikit|berantakan|jaket|kulit/i.test(t)),
    "Test 2.3: Zero raw Indonesian residue in hair & jacket variant"
  );

  // --- Test 3: Fallback Case (Kata tak dikenal diteruskan apa adanya, bukan dikarang) ---
  console.log("\n--- Scenario 3: Fallback Case (Unrecognized Vocabulary) ---");
  const input3 = "memakai blangkon batik parang";
  const tokens3 = translateChatTrigger(input3);

  console.log(`Input: "${input3}"`);
  console.log(`Tokens:`, tokens3);

  assert(
    tokens3.join(" ").includes("blangkon") && tokens3.join(" ").includes("batik parang"),
    "Test 3.1: Unrecognized cultural terms ('blangkon', 'batik parang') preserved verbatim without hallucination"
  );
  assert(
    tokens3.join(" ").includes("wearing"),
    "Test 3.2: Known directive verb 'memakai' correctly translated to 'wearing' alongside fallback terms"
  );

  // --- Test 4: Passthrough Bahasa Inggris ---
  console.log("\n--- Scenario 4: English Passthrough ---");
  const input4 = "wearing oversized vintage leather bomber jacket";
  const tokens4 = translateChatTrigger(input4);
  console.log(`Input: "${input4}"`);
  console.log(`Tokens:`, tokens4);

  assert(
    tokens4.join(" ").includes("oversized vintage leather bomber jacket"),
    "Test 4.1: Pre-existing English text passed through cleanly without corruption"
  );

  // --- Test 5: Empty / Null Safe ---
  console.log("\n--- Scenario 5: Empty Input Safety ---");
  const emptyRes = translateChatTrigger("");
  assert(
    Array.isArray(emptyRes) && emptyRes.length === 0,
    "Test 5.1: Empty string returns empty array safely"
  );

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} tests passed.`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
