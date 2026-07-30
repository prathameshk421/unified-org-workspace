import { digestEnv } from "./env.js";
import { summarizeDigestWithGroq } from "./groq.js";
import { renderDigestNotification } from "./render.js";
import type { DigestFacts } from "./types.js";

export async function summarizeDigest(
  facts: DigestFacts,
): Promise<{ title: string; body: string; source: "groq" | "template" }> {
  if (!digestEnv.llmEnabled || !digestEnv.groqApiKey) {
    return { ...renderDigestNotification(facts), source: "template" };
  }

  try {
    const out = await summarizeDigestWithGroq(facts, {
      apiKey: digestEnv.groqApiKey,
      model: digestEnv.groqModel,
      timeoutMs: digestEnv.llmTimeoutMs,
    });
    return { ...out, source: "groq" };
  } catch {
    return { ...renderDigestNotification(facts), source: "template" };
  }
}
