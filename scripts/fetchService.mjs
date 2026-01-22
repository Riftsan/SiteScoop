#!/usr/bin/env node
import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import { fetchPage } from "./fetchPage.mjs";
import { chunkText } from "./textChunker.mjs";
import { isBlockedHost, normalizeTargetUrl } from "./security.mjs";

const port = Number(process.env.FETCH_SERVICE_PORT || 8787);
const allowPrivate = process.env.FETCH_ALLOW_PRIVATE === "true";
const debug = process.env.FETCH_DEBUG === "true";
const maxUrlLength = Number(process.env.FETCH_MAX_URL_LENGTH || 2048);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function parseBoolean(value, defaultValue) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

function parseNumber(value, defaultValue) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function logDebug(message, extra = {}) {
  if (!debug) {
    return;
  }
  const payload = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[fetchService] ${message}${payload}`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  if (reqUrl.pathname !== "/fetch") {
    return json(res, 404, { error: "Not found" });
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return json(res, 400, { error: "Missing url parameter" });
  }

  if (target.length > maxUrlLength) {
    return json(res, 400, { error: "URL too long" });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json(res, 400, { error: "Invalid url" });
  }

  try {
    normalizeTargetUrl(parsed.toString());
  } catch (err) {
    return json(res, 400, { error: err.message || "Invalid url" });
  }

  if (isBlockedHost(parsed.hostname, allowPrivate)) {
    return json(res, 403, { error: "Target host is not allowed" });
  }

  const requestId = crypto.randomUUID();
  const start = Date.now();
  logDebug("request:start", { requestId, url: parsed.toString() });

  const includeMeta = parseBoolean(reqUrl.searchParams.get("includeMeta"), false);
  const allowFallbacks = parseBoolean(reqUrl.searchParams.get("allowFallbacks"), true);
  const preferReadability = parseBoolean(reqUrl.searchParams.get("preferReadability"), true);
  const userAgentMode = reqUrl.searchParams.get("userAgentMode") || "url";
  const userAgentFamily = reqUrl.searchParams.get("userAgentFamily") || "desktop";
  const timeoutMs = parseNumber(reqUrl.searchParams.get("timeoutMs"), 15000);
  const maxChars = parseNumber(reqUrl.searchParams.get("maxChars"), 15000);
  const maxBytes = parseNumber(reqUrl.searchParams.get("maxBytes"), 2_000_000);
  const follow = parseNumber(reqUrl.searchParams.get("redirectLimit"), 3);
  const chunkSize = parseNumber(reqUrl.searchParams.get("chunkSize"), null);
  const chunkOverlap = parseNumber(reqUrl.searchParams.get("chunkOverlap"), 200);
  const maxChunks = parseNumber(reqUrl.searchParams.get("maxChunks"), 10);

  try {
    const result = await fetchPage(parsed.toString(), {
      includeMeta,
      allowFallbacks,
      preferReadability,
      userAgentMode,
      userAgentFamily,
      timeoutMs,
      maxChars,
      maxBytes,
      follow,
      debug
    });

    const text = typeof result === "string" ? result : result.text;
    const meta = typeof result === "string" ? undefined : result.meta;
    const response = { url: parsed.toString(), text };

    if (includeMeta && meta) {
      response.meta = meta;
    }

    if (chunkSize) {
      response.chunks = chunkText(text, {
        chunkSize,
        overlap: chunkOverlap,
        maxChunks
      });
    }

    logDebug("request:success", {
      requestId,
      durationMs: Date.now() - start,
      chars: text.length
    });

    return json(res, 200, response);
  } catch (err) {
    logDebug("request:fail", {
      requestId,
      durationMs: Date.now() - start,
      error: err.message || String(err)
    });
    return json(res, 502, { error: err.message || String(err) });
  }
});

server.listen(port, () => {
  console.log(`Fetch service listening on http://localhost:${port}`);
});
