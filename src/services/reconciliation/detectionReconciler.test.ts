import { reconcileLocalWithLLM, LocalAnchorContext } from './detectionReconciler';
import { AIResponse } from '../../types/app';

function runTests() {
  console.log("==================================================");
  console.log("RUNNING TAHAP 1 DETECTION RECONCILER UNIT TESTS");
  console.log("==================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
    }
  }

  // --- FIXTURE DATA ---
  const emptyLLMData: AIResponse = {
    analysis: { lighting: "", angle: "", environment: "no person detected" },
    prompts: { lighting_type: "", color_tones: "", pose: "subject not detected", outfit: "", negative: "", skin_tone: "", prompt: "" },
    simulation: "No subject found in analysis."
  };

  const strongMainDetection = {
    subjects: [{ bbox: { x: 100, y: 100, w: 400, h: 600 }, confidence: 0.85, type: 'person' as const }],
    primary: { bbox: { x: 100, y: 100, w: 400, h: 600 }, confidence: 0.85, type: 'person' as const }
  };

  const strongReplacementDetection = {
    subjects: [{ bbox: { x: 200, y: 150, w: 350, h: 550 }, confidence: 0.92, type: 'person' as const }],
    primary: { bbox: { x: 200, y: 150, w: 350, h: 550 }, confidence: 0.92, type: 'person' as const }
  };

  const weakDetection = {
    subjects: [{ bbox: { x: 10, y: 10, w: 20, h: 20 }, confidence: 0.05, type: 'person' as const }],
    primary: { bbox: { x: 10, y: 10, w: 20, h: 20 }, confidence: 0.05, type: 'person' as const }
  };

  const validPose = {
    keypoints: [
      { name: 'left_shoulder', x: 200, y: 200, score: 0.9 },
      { name: 'right_shoulder', x: 400, y: 200, score: 0.9 },
      { name: 'left_hip', x: 200, y: 500, score: 0.85 },
      { name: 'right_hip', x: 400, y: 500, score: 0.85 }
    ],
    skeleton: [] as [string, string][],
    bbox: { x: 200, y: 200, width: 200, height: 300 },
    confidence: 0.88
  };

  // --- SCENARIO (i): LLM not-detected + Local Strong => Subject Present ---
  console.log("\n--- Scenario (i): LLM False Negative + Strong Local Detection ---");
  const localStrongContext: LocalAnchorContext = {
    mainDetection: strongMainDetection,
    replacementDetection: strongReplacementDetection,
    mainPose: null,
    replacementPose: null
  };

  const result1 = reconcileLocalWithLLM(emptyLLMData, localStrongContext);

  assert(result1.hasMainSubjectAnchor === true, "Main subject anchored despite LLM false-negative");
  assert(result1.hasReplacementSubjectAnchor === true, "Replacement subject anchored despite LLM false-negative");
  assert(result1.replacementCoverageOverride !== undefined, "Coverage override created for replacement subject");
  assert(result1.reconciledLogs.some(l => l.includes("overrides LLM subject-not-detected")), "Override log recorded");

  // --- SCENARIO (ii): LLM Pose Conflict + Local Pose Valid => Local Pose Prioritized ---
  console.log("\n--- Scenario (ii): LLM Pose Conflict + Local Pose Valid ---");
  const llmWithPoseData: AIResponse = {
    analysis: { lighting: "Studio", angle: "Eye Level", environment: "Indoor" },
    prompts: { lighting_type: "", color_tones: "", pose: "LLM conflicting sitting pose", outfit: "", negative: "", skin_tone: "", prompt: "" },
    simulation: "Valid simulation."
  };

  const localPoseContext: LocalAnchorContext = {
    mainDetection: strongMainDetection,
    replacementDetection: strongReplacementDetection,
    mainPose: validPose,
    replacementPose: null
  };

  const result2 = reconcileLocalWithLLM(llmWithPoseData, localPoseContext);

  assert(result2.effectivePoseText.includes("Local MoveNet anchor"), "Local MoveNet pose prioritized");
  assert(result2.effectivePoseText.includes("level shoulder stance"), "Specific keypoint trait present in pose text");
  assert(result2.data.analysis.environment === "Indoor", "LLM environment text preserved intact");
  assert(result2.reconciledLogs.some(l => l.includes("prioritized over LLM pose text")), "Pose conflict resolution log recorded");

  // --- SCENARIO (iii): Local Weak => No Override ---
  console.log("\n--- Scenario (iii): Local Detection Weak => No Override ---");
  const localWeakContext: LocalAnchorContext = {
    mainDetection: weakDetection,
    replacementDetection: null,
    mainPose: null,
    replacementPose: null
  };

  const result3 = reconcileLocalWithLLM(emptyLLMData, localWeakContext);

  assert(result3.hasMainSubjectAnchor === false, "Weak local detection rejected as anchor");
  assert(result3.hasReplacementSubjectAnchor === false, "Null replacement detection rejected as anchor");
  assert(result3.replacementCoverageOverride === undefined, "No coverage override generated for weak local detection");
  assert(result3.reconciledLogs.some(l => l.includes("weak or absent")), "Weak detection log recorded");

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} tests passed.`);
  console.log("==================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
