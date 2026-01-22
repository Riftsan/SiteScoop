export function chunkText(text, options = {}) {
  const {
    chunkSize = 1200,
    overlap = 200,
    maxChunks = 10
  } = options;

  if (!text) {
    return [];
  }

  const size = Math.max(100, Number(chunkSize) || 1200);
  const overlapSize = Math.max(0, Math.min(size - 1, Number(overlap) || 0));
  const step = size - overlapSize;
  const chunks = [];

  for (let i = 0; i < text.length; i += step) {
    if (chunks.length >= maxChunks) {
      break;
    }
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length >= 20) {
      chunks.push(chunk);
    }
  }

  return chunks;
}
