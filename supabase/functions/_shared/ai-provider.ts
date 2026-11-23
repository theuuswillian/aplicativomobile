type ResponsesInput = string | Array<Record<string, unknown>>;

async function readBoundedText(response: Response, maximumBytes: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;

  if (!Array.isArray(root.output)) return null;
  const parts: string[] = [];
  for (const item of root.output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "message" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (!part || typeof part !== "object") continue;
      const content = part as Record<string, unknown>;
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

export async function requestStructuredAi(
  instructions: string,
  input: ResponsesInput,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<unknown | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL");
  if (!apiKey || !model || apiKey.length > 500 || model.length > 120) return null;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        store: false,
        max_output_tokens: 900,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }

  const raw = await readBoundedText(response, 96 * 1024);
  if (!raw) return null;

  try {
    const payload: unknown = JSON.parse(raw);
    const text = extractOutputText(payload);
    if (!text || text.length > 24_000) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
