import type { DigestFacts } from "./types.js";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export type GroqSummarizeOpts = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

function extractJsonObject(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(candidate) as { title?: unknown; body?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.body !== "string") {
    throw new Error("Groq response missing title/body strings");
  }
  if (!parsed.title.trim() || !parsed.body.trim()) {
    throw new Error("Groq response has empty title/body");
  }
  return { title: parsed.title.trim(), body: parsed.body.trim() };
}

/** Reject model output that invents resource ids not present in scoped facts. */
export function assertSummaryUsesOnlyKnownIds(
  facts: DigestFacts,
  body: string,
): void {
  const known = new Set(facts.items.map((i) => i.id));
  // cuid-ish tokens that look like resource ids in the body
  const idLike = body.match(/\b[a-z][a-z0-9]{20,}\b/gi) ?? [];
  for (const token of idLike) {
    // Only flag tokens that match our known id charset and length of prisma cuids
    if (token.length >= 20 && known.size > 0) {
      // If it matches the shape of one of our ids' prefixes but isn't known — soft check:
      // only fail when the token exactly equals a foreign-looking id from items we didn't include.
      // Simpler: if body contains an id that appears in allowedOrgIds context — skip.
      // Hard rule: if token equals any item id from a parallel forbidden set we don't have here.
      // Practical check: forbid mentioning ids that look like cuids unless in known set.
      const looksLikeCuid = /^c[a-z0-9]{20,}$/i.test(token);
      if (looksLikeCuid && !known.has(token)) {
        throw new Error(`Groq summary referenced unknown resource id ${token}`);
      }
    }
  }
}

export async function summarizeDigestWithGroq(
  facts: DigestFacts,
  opts: GroqSummarizeOpts,
): Promise<{ title: string; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write short in-app progress digests for a multi-tenant workspace. " +
              "Use ONLY the provided JSON facts. Do not invent ids, titles, or organizations. " +
              "Respond with JSON: {\"title\": string, \"body\": string}. Body max ~400 characters.",
          },
          {
            role: "user",
            content: JSON.stringify(facts),
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned empty content");
    }

    const out = extractJsonObject(content);
    assertSummaryUsesOnlyKnownIds(facts, `${out.title}\n${out.body}`);
    return out;
  } finally {
    clearTimeout(timer);
  }
}
