#!/usr/bin/env node
import { extractReadableText } from "./extractReadable.mjs";
import { pickUserAgent } from "./userAgents.mjs";

const fetchFn = globalThis.fetch ?? (await import("node-fetch")).default;

const strategyCache = new Map();

function buildFallbackUrls(url) {
  const fallbacks = [url];
  try {
    const parsed = new URL(url);
    const hostAndPath = `${parsed.host}${parsed.pathname}${parsed.search}`;
    fallbacks.push(`https://r.jina.ai/http://${hostAndPath}`);
    fallbacks.push(`https://r.jina.ai/https://${hostAndPath}`);
  } catch {
    // Ignore URL parse failures; caller will handle errors.
  }
  return fallbacks;
}

async function readWithLimit(res, maxBytes) {
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    throw new Error(`Response too large (${contentLength} bytes)`);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`Response exceeded ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function fetchHtml(targetUrl, requestOptions) {
  const { userAgent, signal, follow = 3, maxBytes = 2_000_000 } = requestOptions;

  const res = await fetchFn(targetUrl, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    redirect: "follow",
    follow,
    signal
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const html = await readWithLimit(res, maxBytes);
  return { html, contentType };
}

function resolveOptions(options) {
  return {
    maxChars: options.maxChars ?? Number(process.env.FETCH_MAX_CHARS || 15000),
    userAgentMode: options.userAgentMode ?? process.env.FETCH_UA_MODE ?? "url",
    userAgentFamily: options.userAgentFamily ?? process.env.FETCH_UA_FAMILY ?? "desktop",
    userAgent: options.userAgent ?? process.env.FETCH_USER_AGENT ?? "Mozilla/5.0",
    timeoutMs: options.timeoutMs ?? Number(process.env.FETCH_TIMEOUT_MS || 15000),
    maxBytes: options.maxBytes ?? Number(process.env.FETCH_MAX_BYTES || 2_000_000),
    allowFallbacks: options.allowFallbacks ?? (process.env.FETCH_ALLOW_FALLBACKS !== "false"),
    preferReadability: options.preferReadability ?? (process.env.FETCH_PREFER_READABILITY !== "false"),
    follow: options.follow ?? Number(process.env.FETCH_REDIRECT_LIMIT || 3),
    includeMeta: options.includeMeta ?? false,
    debug: options.debug ?? (process.env.FETCH_DEBUG === "true")
  };
}

export async function fetchPage(url, options = {}) {
  const resolved = resolveOptions(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolved.timeoutMs);

  try {
    const urls = resolved.allowFallbacks ? buildFallbackUrls(url) : [url];
    const hostKey = (() => {
      try {
        return new URL(url).host;
      } catch {
        return "";
      }
    })();

    const cachedStrategy = hostKey ? strategyCache.get(hostKey) : null;
    const baseUserAgent = pickUserAgent({
      mode: resolved.userAgentMode,
      url,
      family: resolved.userAgentFamily,
      fixed: resolved.userAgent
    });

    const strategies = [
      { via: "direct", preferReadability: true },
      { via: "direct", preferReadability: false },
      { via: "proxy", preferReadability: true },
      { via: "proxy", preferReadability: false }
    ];

    if (cachedStrategy) {
      const index = strategies.findIndex(
        (strategy) =>
          strategy.via === cachedStrategy.via &&
          strategy.preferReadability === cachedStrategy.preferReadability
      );
      if (index > 0) {
        strategies.unshift(strategies.splice(index, 1)[0]);
      }
    }

    let lastError;
    for (const strategy of strategies) {
      const targetUrls = strategy.via === "proxy" ? urls.slice(1) : urls.slice(0, 1);
      for (const targetUrl of targetUrls) {
        try {
          const { html } = await fetchHtml(targetUrl, {
            userAgent: baseUserAgent,
            signal: controller.signal,
            follow: resolved.follow,
            maxBytes: resolved.maxBytes
          });

          const extracted = extractReadableText(html, url, {
            maxChars: resolved.maxChars,
            preferReadability: strategy.preferReadability && resolved.preferReadability
          });

          if (extracted.text) {
            if (hostKey) {
              strategyCache.set(hostKey, {
                via: strategy.via,
                preferReadability: strategy.preferReadability
              });
            }

            if (resolved.includeMeta) {
              return {
                text: extracted.text,
                meta: {
                  title: extracted.title,
                  byline: extracted.byline,
                  excerpt: extracted.excerpt,
                  method: extracted.method,
                  via: strategy.via
                }
              };
            }

            return extracted.text;
          }
        } catch (err) {
          if (resolved.debug) {
            console.warn(`[fetchPage] ${targetUrl} failed: ${err.message || String(err)}`);
          }
          lastError = err;
        }
      }
    }

    throw lastError ?? new Error("Unable to fetch page content");
  } finally {
    clearTimeout(timeout);
  }
}

const isCli = process.argv[1] && process.argv[1].endsWith("fetchPage.mjs");
if (isCli) {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: fetchpage <url>");
    process.exit(1);
  }

  fetchPage(url)
    .then((result) => {
      if (typeof result === "string") {
        process.stdout.write(result);
      } else {
        process.stdout.write(result.text);
      }
    })
    .catch((err) => {
      console.error(err.message || String(err));
      process.exit(1);
    });
}
