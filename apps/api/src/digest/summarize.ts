import { digestEnv } from "./env.js";
import { summarizeDigestWithGroq } from "./groq.js";
import type { DigestChannel } from "./prompts.js";
import {
  renderDigestEmailNotification,
  renderDigestNotification,
} from "./render.js";
import type { DigestFacts } from "./types.js";

export type DigestSummary = {
  title: string;
  body: string;
  source: "groq" | "template";
};

function renderTemplate(
  facts: DigestFacts,
  channel: DigestChannel,
): { title: string; body: string } {
  return channel === "email"
    ? renderDigestEmailNotification(facts)
    : renderDigestNotification(facts);
}

async function summarizeDigestForChannel(
  facts: DigestFacts,
  channel: DigestChannel,
): Promise<DigestSummary> {
  if (!digestEnv.llmEnabled || !digestEnv.groqApiKey) {
    return { ...renderTemplate(facts, channel), source: "template" };
  }

  try {
    const out = await summarizeDigestWithGroq(facts, {
      apiKey: digestEnv.groqApiKey,
      model: digestEnv.groqModel,
      timeoutMs: digestEnv.llmTimeoutMs,
      channel,
    });
    return { ...out, source: "groq" };
  } catch {
    return { ...renderTemplate(facts, channel), source: "template" };
  }
}

export async function summarizeDigest(facts: DigestFacts): Promise<DigestSummary> {
  return summarizeDigestForChannel(facts, "in_app");
}

export async function summarizeDigestEmail(
  facts: DigestFacts,
): Promise<DigestSummary> {
  return summarizeDigestForChannel(facts, "email");
}
