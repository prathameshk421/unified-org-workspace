import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestFacts } from "./types.js";

const { digestEnv } = vi.hoisted(() => ({
  digestEnv: {
    llmEnabled: false,
    groqApiKey: undefined as string | undefined,
    groqModel: "openai/gpt-oss-20b",
    llmTimeoutMs: 8000,
  },
}));

vi.mock("./env.js", () => ({ digestEnv }));

const sampleFacts: DigestFacts = {
  userId: "user-1",
  collectedAt: "2026-07-31T12:00:00.000Z",
  allowedOrgIds: ["org-acme"],
  assignedTicketCount: 2,
  staleAssignedTicketCount: 1,
  waitingPrCount: 1,
  oldestWaitingPrIdleDays: 3,
  sharedTicketCount: 1,
  sharedPrCount: 0,
  items: [
    {
      kind: "ticket",
      id: "clticket111111111111111111",
      title: "Login timeout on mobile",
      orgId: "org-acme",
      orgName: "Acme Corp",
      signal: "assigned",
    },
    {
      kind: "ticket",
      id: "clticket222222222222222222",
      title: "Stale billing export",
      orgId: "org-acme",
      orgName: "Acme Corp",
      signal: "stale_assigned",
    },
    {
      kind: "pull_request",
      id: "clpr33333333333333333333",
      title: "Add audit middleware",
      orgId: "org-acme",
      orgName: "Acme Corp",
      signal: "waiting_review",
    },
    {
      kind: "ticket",
      id: "clticket444444444444444444",
      title: "Shared incident follow-up",
      orgId: "org-acme",
      orgName: "Acme Corp",
      signal: "shared",
    },
  ],
};

describe("renderDigestEmailNotification", () => {
  it("structures a professional plain-text email with sections and Argus sign-off", async () => {
    const { renderDigestEmailNotification } = await import("./render.js");
    const { title, body } = renderDigestEmailNotification(sampleFacts);

    expect(title).toContain("Argus");
    expect(body).toMatch(/^Hello,/);
    expect(body).toContain("ASSIGNED TICKETS");
    expect(body).toContain("PULL REQUESTS WAITING ON YOU");
    expect(body).toContain("SHARED WITH YOU");
    expect(body).toContain("- Ticket: Login timeout on mobile (Acme Corp)");
    expect(body).toContain("- PR: Add audit middleware (Acme Corp)");
    expect(body).toContain("Stay on top of your workload,");
    expect(body).toContain("Argus");
    expect(body).toContain("Unified Org Workspace");
  });

  it("handles empty digest with greeting and sign-off", async () => {
    const { renderDigestEmailNotification } = await import("./render.js");
    const empty: DigestFacts = {
      ...sampleFacts,
      assignedTicketCount: 0,
      staleAssignedTicketCount: 0,
      waitingPrCount: 0,
      oldestWaitingPrIdleDays: null,
      sharedTicketCount: 0,
      sharedPrCount: 0,
      items: [],
    };

    const { title, body } = renderDigestEmailNotification(empty);

    expect(title).toContain("all caught up");
    expect(body).toMatch(/^Hello,/);
    expect(body).toContain("Best regards,");
    expect(body).toContain("Argus");
  });
});

describe("summarizeDigestWithGroq channel prompts", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses in-app system prompt for in_app channel", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Action needed",
                body: "Two tickets and one PR need your attention.",
              }),
            },
          },
        ],
      }),
    });

    const { summarizeDigestWithGroq } = await import("./groq.js");
    const { IN_APP_DIGEST_SYSTEM_PROMPT } = await import("./prompts.js");

    await summarizeDigestWithGroq(sampleFacts, {
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      channel: "in_app",
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]!.content).toBe(IN_APP_DIGEST_SYSTEM_PROMPT);
    expect(body.messages[0]!.content).toContain("max ~400 characters");
  });

  it("uses email system prompt for email channel", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Your progress digest from Argus",
                body: "Hello,\n\nHere is your digest.\n\nBest,\nArgus",
              }),
            },
          },
        ],
      }),
    });

    const { summarizeDigestWithGroq } = await import("./groq.js");
    const { EMAIL_DIGEST_SYSTEM_PROMPT } = await import("./prompts.js");

    await summarizeDigestWithGroq(sampleFacts, {
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 5000,
      channel: "email",
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]!.content).toBe(EMAIL_DIGEST_SYSTEM_PROMPT);
    expect(body.messages[0]!.content).toContain("max ~1200 characters");
    expect(body.messages[0]!.content).toContain("plain-text email");
  });
});

describe("summarizeDigestEmail template fallback", () => {
  beforeEach(() => {
    digestEnv.llmEnabled = false;
    digestEnv.groqApiKey = undefined;
  });

  it("falls back to email template when LLM is disabled", async () => {
    const { summarizeDigestEmail } = await import("./summarize.js");
    const result = await summarizeDigestEmail(sampleFacts);

    expect(result.source).toBe("template");
    expect(result.body).toContain("Hello,");
    expect(result.body).toContain("Argus");
    expect(result.title).toContain("Argus");
  });
});
