import "dotenv/config";
import express from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";
import { tryOpenAICompatibleProviders } from "./server/providers";

/**
 * Checks if an IP address belongs to private/internal/reserved ranges
 */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const normalized = ip.trim().toLowerCase();

  // IPv4 checks
  if (
    normalized.startsWith("127.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("169.254.") || // Link-local and cloud metadata (169.254.169.254)
    normalized.startsWith("0.") ||
    normalized === "255.255.255.255"
  ) {
    return true;
  }
  if (normalized.startsWith("192.168.")) {
    return true;
  }
  // 172.16.0.0 - 172.31.255.255
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  // 100.64.0.0 - 100.127.255.255 (Carrier-grade NAT)
  if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
    return true;
  }

  // IPv6 checks
  if (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.includes("::ffff:127.") ||
    normalized.includes("::ffff:10.") ||
    normalized.includes("::ffff:192.168.") ||
    normalized.includes("::ffff:169.254.")
  ) {
    return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF attacks
 */
async function validateUrlForSSRF(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https protocols are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    throw new Error("Access to local/internal domains is forbidden");
  }

  // If hostname is directly an IP literal
  if (isPrivateIp(hostname)) {
    throw new Error("Access to private/internal IP addresses is forbidden");
  }

  // Resolve DNS to verify no DNS rebinding or private IP
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      throw new Error(`DNS resolution returned no addresses for host: ${hostname}`);
    }
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error(`Domain resolves to forbidden private/internal IP: ${record.address}`);
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes("forbidden")) {
      throw err;
    }
    throw new Error(`DNS resolution failed for host: ${hostname}`);
  }

  return parsed;
}

/**
 * Safely fetches content with SSRF validation on redirects, timeout, and size limits
 */
interface SafeFetchResult {
  isDirectImage: boolean;
  imageUrl: string | null;
  html: string;
}

async function safeFetchHtml(initialUrl: string, maxRedirects = 3): Promise<SafeFetchResult> {
  let currentUrl = initialUrl;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const validated = await validateUrlForSSRF(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(validated.toString(), {
        signal: controller.signal as any,
        redirect: "manual",
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      // Handle redirects manually to validate redirect target against SSRF
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect location missing");
        currentUrl = new URL(location, validated).toString();
        redirects++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check content-type
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        return { isDirectImage: true, imageUrl: currentUrl, html: "" };
      }

      // Check content-length header
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
        throw new Error("Response size exceeds 5MB limit");
      }

      const text = await response.text();
      if (text.length > 5 * 1024 * 1024) {
        throw new Error("Response body exceeds 5MB limit");
      }

      return { isDirectImage: false, imageUrl: null, html: text };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Too many redirects");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API: Resolve Image from URL (Secured against SSRF with DNS resolution and size limits)
  app.post("/api/resolve-image", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "No valid URL provided" });
    }

    try {
      console.log(`[Proxy] Resolving URL securely: ${url}`);
      
      const fetchResult = await safeFetchHtml(url);
      if (fetchResult.isDirectImage && fetchResult.imageUrl) {
        console.log(`[Proxy] Direct image URL resolved: ${fetchResult.imageUrl}`);
        return res.json({ imageUrl: fetchResult.imageUrl });
      }

      const html = fetchResult.html;
      
      // Look for Open Graph image
      const ogMatch = html.match(/property="og:image" content="([^"]+)"/) || html.match(/name="og:image" content="([^"]+)"/);
      let imageUrl = ogMatch?.[1];

      // Specifically check for Instagram's meta tags if og:image is missing or complex
      if (!imageUrl && url.includes("instagram.com")) {
        const jsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]);
            imageUrl = data.image || data.thumbnailUrl;
          } catch (e) {}
        }
      }

      if (!imageUrl) {
        const imgMatches = html.match(/<img[^>]+src="([^">]+)"/g);
        if (imgMatches) {
          imageUrl = imgMatches.find(m => m.includes("fbcdn.net") || m.includes("cdninstagram.com"))?.match(/src="([^">]+)"/)?.[1];
        }
      }

      if (imageUrl) {
        imageUrl = imageUrl.replace(/&amp;/g, '&');
        console.log(`[Proxy] Found image: ${imageUrl}`);
        res.json({ imageUrl });
      } else {
        res.status(404).json({ error: "No image found on page" });
      }
    } catch (error: any) {
      console.error("[Proxy] Resolution Error:", error.message);
      const isSecurity = error.message?.includes("forbidden") || error.message?.includes("Invalid URL");
      res.status(isSecurity ? 400 : 500).json({ error: error.message || "Failed to resolve image from URL" });
    }
  });

  // API: Fetch Image and return Base64 (CORS bypass for remote image URLs)
  app.post("/api/fetch-image-base64", async (req, res) => {
    const { url, ifNoneMatch, ifModifiedSince } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "No valid URL provided" });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const validated = await validateUrlForSSRF(url);
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*'
      };
      if (ifNoneMatch) {
        headers['If-None-Match'] = ifNoneMatch;
      }
      if (ifModifiedSince) {
        headers['If-Modified-Since'] = ifModifiedSince;
      }

      const response = await fetch(validated.toString(), {
        signal: controller.signal as any,
        headers
      });

      if (response.status === 304) {
        return res.json({ notModified: true });
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch image: HTTP status ${response.status}`);
      }

      const MAX_FETCH_SIZE_BYTES = 20 * 1024 * 1024; // 20MB safety cap
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_FETCH_SIZE_BYTES) {
        throw new Error("Image size exceeds 20MB safety limit");
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const buffer = await response.buffer();
      if (buffer.length > MAX_FETCH_SIZE_BYTES) {
        throw new Error("Image size exceeds 20MB safety limit");
      }

      const base64 = buffer.toString("base64");
      const etag = response.headers.get("etag") || undefined;
      const lastModified = response.headers.get("last-modified") || undefined;

      return res.json({
        base64,
        mimeType: contentType,
        etag,
        lastModified
      });
    } catch (error: any) {
      console.error("[FetchImageBase64] Error:", error.message);
      const isTimeout = error.name === "AbortError" || error.message?.includes("aborted");
      const errorMsg = isTimeout ? "Image fetch timed out after 30 seconds" : (error.message || "Failed to fetch image");
      res.status(500).json({ error: errorMsg });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // API: Proxy endpoint with branching (Gemini for Image Generation, OpenRouter for Data Retrieval)
  app.post("/api/generate", async (req, res) => {
    try {
      const params = req.body.params || req.body;
      if (!params || (!params.contents && !params.prompt && !params.model)) {
        return res.status(400).json({ error: "Request body missing params or contents" });
      }

      const targetModel = params.model || "";
      const isImageModel = targetModel.includes("image") || targetModel.includes("nano-banana");

      if (isImageModel) {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error("GEMINI_API_KEY missing");

        const genAI = new GoogleGenAI({ apiKey: key }) as any;
        const contents = params.contents || [{ role: "user", parts: [{ text: params.prompt }] }];
        
        const generateOptions: any = { 
          model: targetModel,
          contents 
        };
        if (params.config) {
          generateOptions.config = params.config;
        }

        console.log(`[Gemini Image Branch] Dispatching generateContent to image model: ${targetModel}`);
        const response = await genAI.models.generateContent(generateOptions);
        return res.json(response);
      }

      // Data retrieval route -> OpenRouter
      const providerResult = await tryOpenAICompatibleProviders(params);
      return res.json(providerResult);
    } catch (error: any) {
      console.error("[Generate Endpoint] Error:", error.message || error);
      
      // Propagate real status code and detailed error
      const rawMsg = error.message || String(error);
      let statusCode = 500;
      if (rawMsg.includes("429") || error.status === "RESOURCE_EXHAUSTED") statusCode = 429;
      else if (rawMsg.includes("404") || error.status === "NOT_FOUND") statusCode = 404;
      else if (rawMsg.includes("400") || error.status === "INVALID_ARGUMENT") statusCode = 400;
      else if (typeof error.status === "number" && error.status >= 400 && error.status < 600) statusCode = error.status;

      res.status(statusCode).json({ 
        error: rawMsg,
        status: error.status,
        code: error.code || statusCode,
        details: error.details || undefined
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
