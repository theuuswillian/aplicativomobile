const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?(system|developer)\s+prompt/i,
  /show\s+me\s+your\s+hidden\s+instructions?/i,
  /act\s+as\s+(the\s+)?system/i,
  /ignore\s+(as\s+)?instru[cç][oõ]es\s+anteriores/i,
  /mostre\s+(o\s+)?prompt\s+(do\s+)?sistema/i,
  /revele\s+(as\s+)?instru[cç][oõ]es\s+ocultas/i
];

export function sanitizeAiInput(value: string, maxLength = 4000): string {
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 20000) throw new TypeError("Limite de texto inválido.");
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "[conteúdo removido]")
    .trim()
    .slice(0, maxLength);
}

export function containsPromptInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function radarIdempotencyKey(userId: string, alertId: string, generation: number, referenceDate: string): string {
  if (!userId.trim() || !alertId.trim() || !Number.isInteger(generation) || generation < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new TypeError("Identificadores de alerta inválidos.");
  return `${userId}:${alertId}:${generation}:${referenceDate}`;
}

export function shouldFireRadar(
  condition: "above" | "below" | "daily_drop",
  threshold: number,
  currentPrice: number,
  previousPrice?: number
): boolean {
  if (![threshold, currentPrice].every(Number.isFinite) || threshold <= 0 || currentPrice < 0) {
    throw new TypeError("Parâmetros de Radar inválidos.");
  }
  if (condition === "above") return currentPrice >= threshold;
  if (condition === "below") return currentPrice <= threshold;
  if (previousPrice === undefined || !Number.isFinite(previousPrice) || previousPrice <= 0) return false;
  return ((currentPrice - previousPrice) / previousPrice) * 100 <= -threshold;
}
