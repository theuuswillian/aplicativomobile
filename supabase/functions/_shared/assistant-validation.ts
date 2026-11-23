export type SafeJson = null | boolean | number | string | SafeJson[] | { [key: string]: SafeJson };

function sanitizeValue(value: unknown, depth: number): SafeJson | null {
  if (depth > 4) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return value.length <= 400 ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") : null;
  }
  if (Array.isArray(value)) {
    if (value.length > 30) return null;
    const result: SafeJson[] = [];
    for (const item of value) {
      const safe = sanitizeValue(item, depth + 1);
      if (safe === null && item !== null) return null;
      result.push(safe);
    }
    return result;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    if (entries.length > 40) return null;
    const result: Record<string, SafeJson> = {};
    for (const [key, item] of entries) {
      if (!/^[\p{L}\p{N}_ -]{1,60}$/u.test(key)) return null;
      const safe = sanitizeValue(item, depth + 1);
      if (safe === null && item !== null) return null;
      result[key] = safe;
    }
    return result;
  }
  return null;
}

export function validateAssistantInput(body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["question", "facts", "history"].includes(key))) return null;
  if (typeof body.question !== "string" || body.question.trim().length < 2 ||
      body.question.length > 1_000 || !body.facts ||
      typeof body.facts !== "object" || Array.isArray(body.facts)) return null;

  const facts = sanitizeValue(body.facts, 0);
  if (!facts || Array.isArray(facts) || typeof facts !== "object") return null;
  if (new TextEncoder().encode(JSON.stringify(facts)).length > 12_000) return null;

  const historyInput = body.history ?? [];
  if (!Array.isArray(historyInput) || historyInput.length > 3) return null;
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of historyInput) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["role", "content"].includes(key)) ||
        (record.role !== "user" && record.role !== "assistant") ||
        typeof record.content !== "string" || record.content.length > 300) return null;
    history.push({
      role: record.role,
      content: record.content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""),
    });
  }

  return {
    question: body.question.trim(),
    facts,
    history,
  };
}

function normalizeNumberToken(token: string): string {
  let value = token.replace(/R\$\s*/g, "").replace(/\s/g, "");
  const suffix = value.endsWith("%") ? "%" : "";
  value = value.replace(/%$/, "");
  const negative = value.startsWith("-");
  value = value.replace(/^-/, "");
  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    value = value.replace(",", ".");
  }
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}${suffix}`;
}

export function extractNumericTokens(value: string): string[] {
  const matches = value.match(/(?:R\$\s*)?-?\d[\d.\s]*(?:,\d+)?\s*%?/g) ?? [];
  return matches.map(normalizeNumberToken);
}

export function validateAssistantOutput(value: unknown, sourceText: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 ||
      Object.keys(record).some((key) => !["answer", "sufficient"].includes(key)) ||
      typeof record.answer !== "string" || typeof record.sufficient !== "boolean") return null;

  const answer = record.answer.trim();
  if (answer.length < 2 || answer.length > 600) return null;
  const sentences = answer.split(/[.!?]+/).filter((part) => part.trim().length > 0);
  if (sentences.length > 3) return null;

  const allowed = new Set(extractNumericTokens(sourceText));
  const claims = extractNumericTokens(answer);
  if (claims.some((claim) => !allowed.has(claim))) return null;

  return { answer, sufficient: record.sufficient };
}
