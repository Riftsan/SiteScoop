import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

function cleanupDocument(document) {
  const selectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "canvas",
    "form",
    "nav",
    "footer",
    "header",
    "aside"
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  });
}

function normalizeText(text, maxChars) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function extractReadableText(html, baseUrl, options = {}) {
  const {
    maxChars = 15000,
    preferReadability = true
  } = options;

  const dom = new JSDOM(html, { url: baseUrl });
  const { document } = dom.window;

  cleanupDocument(document);

  let article = null;
  if (preferReadability) {
    try {
      const reader = new Readability(document);
      article = reader.parse();
    } catch {
      article = null;
    }
  }

  const readableText = article?.textContent ?? "";
  const fallbackText = document.body?.textContent ?? "";
  const method = readableText ? "readability" : "dom";
  const rawText = readableText || fallbackText;

  return {
    text: normalizeText(rawText, maxChars),
    title: article?.title ?? document.title ?? "",
    byline: article?.byline ?? "",
    excerpt: article?.excerpt ?? "",
    method
  };
}
