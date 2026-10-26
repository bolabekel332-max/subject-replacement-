import fetch from "node-fetch";

export interface ProviderStatus {
  name: string;
  configured: boolean;
  visionModel: string;
  textModel: string;
  role: string;
}

function hasImageContent(contents: any): boolean {
  if (!contents) return false;
  const str = JSON.stringify(contents);
  return str.includes("inlineData") || str.includes("image_url");
}

function convertGeminiContentsToOpenAI(contents: any): Array<{ role: string; content: string | Array<any> }> {
  let parts: any[] = [];
  if (typeof contents === "string") {
    return [{ role: "user", content: contents }];
  }
  if (Array.isArray(contents)) {
    for (const item of contents) {
      if (item.parts && Array.isArray(item.parts)) {
        parts.push(...item.parts);
      } else if (item.text || item.inlineData) {
        parts.push(item);
      }
    }
  } else if (contents.parts && Array.isArray(contents.parts)) {
    parts = contents.parts;
  } else {
    return [{ role: "user", content: String(contents) }];
  }

  const contentParts: Array<any> = [];
  for (const p of parts) {
    if (p.text) {
      contentParts.push({ type: "text", text: p.text });
    } else if (p.inlineData) {
      const mime = p.inlineData.mimeType || "image/jpeg";
      const base64Data = p.inlineData.data;
      const dataUri = base64Data.startsWith("data:") ? base64Data : `data:${mime};base64,${base64Data}`;
      contentParts.push({
        type: "image_url",
        image_url: { url: dataUri }
      });
    }
  }

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return [{ role: "user", content: contentParts[0].text }];
  }
  return [{ role: "user", content: contentParts.length > 0 ? contentParts : "" }];
}

export async function tryOpenAICompatibleProviders(params: any): Promise<any> {
  const isVision = hasImageContent(params.contents);

  // OpenRouter (Only data provider)
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";
  if (!openRouterKey.trim()) {
    throw new Error("OpenRouter API key not configured (OPENROUTER_API_KEY missing). Data retrieval requires OpenRouter.");
  }

  const envBaseUrl = (process.env.OPENROUTER_BASE_URL || "").trim();
  const baseUrl = (envBaseUrl && envBaseUrl !== "undefined" && envBaseUrl !== "null" && envBaseUrl.startsWith("http")) 
    ? envBaseUrl 
    : "https://openrouter.ai/api/v1";
  const visionModel = process.env.OPENROUTER_VISION_MODEL || "nvidia/nemotron-3.5-super-vl:free";
  const textModel = process.env.OPENROUTER_TEXT_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
  const model = isVision ? visionModel : textModel;

  console.log(`[Providers] Attempting OpenRouter with model: ${model} (isVision: ${isVision})`);

  let attempt = 0;
  const maxAttempts = 2; // 1 initial + 1 transient retry max

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const result = await callOpenAICompatibleAPI({
        name: "OpenRouter",
        baseUrl,
        apiKey: openRouterKey,
        model,
        params,
        extraHeaders: {
          "HTTP-Referer": "https://aistudio.google.com",
          "X-Title": "AI Studio Applet"
        }
      });
      console.log(`[Providers] OpenRouter success with model: ${model}`);
      return result;
    } catch (err: any) {
      const errMsg = (err.message || String(err)).toLowerCase();
      
      // Classify error: permanent vs transient
      const isPermanent = 
        errMsg.includes("400") || 
        errMsg.includes("401") || 
        errMsg.includes("403") || 
        errMsg.includes("404") || 
        errMsg.includes("limit: 0") || 
        errMsg.includes("limit: 0.0") ||
        errMsg.includes("resource_exhausted");

      if (isPermanent || attempt >= maxAttempts) {
        console.error(`[Providers] OpenRouter permanent error or max retries reached:`, err.message || err);
        throw err;
      }

      console.warn(`[Providers] OpenRouter transient error on attempt ${attempt}. Retrying once...`, err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error("OpenRouter generation failed");
}

function coerceToString(val: any, keyName: string): string {
  if (typeof val === "string") return val;

  const originalType = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
  let strVal = "";

  if (val === null || val === undefined) {
    strVal = "";
  } else if (typeof val === "number" || typeof val === "boolean") {
    strVal = String(val);
  } else if (typeof val === "object") {
    if (val.text && typeof val.text === "string") strVal = val.text;
    else if (val.description && typeof val.description === "string") strVal = val.description;
    else if (val.content && typeof val.content === "string") strVal = val.content;
    else if (val.value && typeof val.value === "string") strVal = val.value;
    else if (Array.isArray(val)) {
      strVal = val.map(item => (typeof item === "string" ? item : (item?.text || JSON.stringify(item)))).join(", ");
    } else {
      strVal = JSON.stringify(val);
    }
  } else {
    strVal = String(val);
  }

  console.log(`[Providers] Coerced key ${keyName} from ${originalType} to string`);
  return strVal;
}

function coerceToNumber(val: any, keyName: string): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  const originalType = val === null ? "null" : typeof val;
  let numVal = 0;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    numVal = isNaN(parsed) ? 0 : parsed;
  }
  console.log(`[Providers] Coerced key ${keyName} from ${originalType} to number (${numVal})`);
  return numVal;
}

function normalizeVisionCompletionText(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        return rawText;
      }
    } else {
      return rawText;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rawText;

  // Structural normalization & Type coercion for prompt analysis
  if (parsed.prompts && !parsed.analysis) {
    parsed.analysis = { lighting: "", angle: "", environment: "" };
    console.log("[Providers] Normalized missing key: analysis");
  }

  if (parsed.analysis && typeof parsed.analysis === "object") {
    parsed.analysis.lighting = coerceToString(parsed.analysis.lighting, "analysis.lighting");
    parsed.analysis.angle = coerceToString(parsed.analysis.angle, "analysis.angle");
    parsed.analysis.environment = coerceToString(parsed.analysis.environment, "analysis.environment");
  }

  if (parsed.analysis && !parsed.prompts) {
    parsed.prompts = { lighting_type: "", color_tones: "", pose: "", outfit: "", negative: "", skin_tone: "", prompt: "" };
    console.log("[Providers] Normalized missing key: prompts");
  }

  if (parsed.prompts && typeof parsed.prompts === "object") {
    parsed.prompts.lighting_type = coerceToString(parsed.prompts.lighting_type, "prompts.lighting_type");
    parsed.prompts.color_tones = coerceToString(parsed.prompts.color_tones, "prompts.color_tones");
    parsed.prompts.pose = coerceToString(parsed.prompts.pose, "prompts.pose");
    parsed.prompts.outfit = coerceToString(parsed.prompts.outfit, "prompts.outfit");
    parsed.prompts.negative = coerceToString(parsed.prompts.negative, "prompts.negative");
    parsed.prompts.skin_tone = coerceToString(parsed.prompts.skin_tone, "prompts.skin_tone");
    parsed.prompts.face_shape = coerceToString(parsed.prompts.face_shape, "prompts.face_shape");
    parsed.prompts.hair = coerceToString(parsed.prompts.hair, "prompts.hair");
    parsed.prompts.expression = coerceToString(parsed.prompts.expression, "prompts.expression");
    parsed.prompts.prompt = coerceToString(parsed.prompts.prompt, "prompts.prompt");
  }

  if (parsed.analysis || parsed.prompts) {
    parsed.simulation = coerceToString(parsed.simulation, "simulation");
  }

  // Structural normalization & Type coercion for unified vision (detection + depth)
  if (parsed.depth && !Array.isArray(parsed.detections)) {
    console.log("[Providers] Normalized missing key: detections");
    parsed.detections = [];
  }

  if (Array.isArray(parsed.detections)) {
    parsed.detections = parsed.detections
      .filter((d: any) => d && typeof d === "object")
      .map((d: any) => ({
        ...d,
        confidence: coerceToNumber(d.confidence, "detections[].confidence")
      }));
  }

  if (parsed.detections && (!parsed.depth || typeof parsed.depth !== "object")) {
    console.log("[Providers] Normalized missing key: depth");
    parsed.depth = {};
  }

  if (parsed.depth && typeof parsed.depth === "object") {
    if (parsed.depth.subjectDepth !== undefined) {
      parsed.depth.subjectDepth = coerceToNumber(parsed.depth.subjectDepth, "depth.subjectDepth");
    }
    if (parsed.depth.groundDepth !== undefined) {
      parsed.depth.groundDepth = coerceToNumber(parsed.depth.groundDepth, "depth.groundDepth");
    }
    if (parsed.depth.horizonDepth !== undefined) {
      parsed.depth.horizonDepth = coerceToNumber(parsed.depth.horizonDepth, "depth.horizonDepth");
    }
  }

  return JSON.stringify(parsed);
}

async function callOpenAICompatibleAPI(options: {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  params: any;
  extraHeaders?: Record<string, string>;
}): Promise<any> {
  const { name, baseUrl, apiKey, model, params, extraHeaders } = options;
  const messages: any[] = [];

  const isVision = hasImageContent(params.contents);
  const isJsonRequested = params.config?.responseMimeType === "application/json" || isVision;
  const defaultTemp = isVision ? 0.15 : 0.7;

  if (params.config?.systemInstruction) {
    messages.push({ role: "system", content: params.config.systemInstruction });
  } else if (isJsonRequested) {
    messages.push({
      role: "system",
      content: "You are a precise vision analysis assistant. You MUST respond ONLY with a valid JSON object. Ensure top-level structure includes required keys with strict types: 'analysis' (object with string fields 'lighting', 'angle', 'environment'), 'prompts' (object with string fields 'lighting_type', 'color_tones', 'pose', 'outfit', 'negative', 'skin_tone', 'face_shape', 'hair', 'expression', 'prompt'), and 'simulation' (MUST be a plain string paragraph, NOT an object or array). Do NOT wrap in markdown or commentary."
    });
  }

  messages.push(...convertGeminiContentsToOpenAI(params.contents));

  const body: any = {
    model,
    messages,
    temperature: params.config?.temperature ?? defaultTemp
  };

  if (isJsonRequested) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(extraHeaders || {})
      },
      body: JSON.stringify(body),
      signal: controller.signal as any
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${name} API error: ${response.status} ${response.statusText} - ${errText}`);
  }

  const data: any = await response.json();
  const choice = data.choices?.[0];
  const rawCompletionText = choice?.message?.content || "";

  if (!rawCompletionText) {
    throw new Error(`${name} returned empty completion text`);
  }

  const normalizedText = normalizeVisionCompletionText(rawCompletionText);

  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: normalizedText }]
        },
        finishReason: choice?.finish_reason?.toUpperCase() || "STOP"
      }
    ],
    text: normalizedText
  };
}

export function getProvidersStatus(): ProviderStatus[] {
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  return [
    {
      name: "OpenRouter",
      configured: openRouterKey.trim().length > 0,
      visionModel: process.env.OPENROUTER_VISION_MODEL || "nvidia/nemotron-3.5-super-vl:free",
      textModel: process.env.OPENROUTER_TEXT_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
      role: "data"
    },
    {
      name: "Gemini Nano Banana",
      configured: !!process.env.GEMINI_API_KEY,
      visionModel: "gemini-3.1-flash-lite-image",
      textModel: "gemini-3.1-flash-lite-image",
      role: "image generation"
    }
  ];
}
