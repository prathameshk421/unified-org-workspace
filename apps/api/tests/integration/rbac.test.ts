import { OrgRole } from "@unified/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import { agent, loginAgent } from "../support/http.js";

type Principal =
  "anonymous" | "org_admin" | "support_agent" | "reviewer" | "cross_org_guest" | "platform_admin";

type Probe = "/rbac/org" | "/rbac/admin" | "/rbac/agent" | "/rbac/reviewer" | "/rbac/platform";

const cases: Array<{
  principal: Principal;
  probe: Probe;
  status: number;
  code?: string;
}> = [
  { principal: "anonymous", probe: "/rbac/org", status: 401 },
  { principal: "anonymous", probe: "/rbac/admin", status: 401 },
  { principal: "anonymous", probe: "/rbac/agent", status: 401 },
  { principal: "anonymous", probe: "/rbac/reviewer", status: 401 },
  { principal: "anonymous", probe: "/rbac/platform", status: 401 },

  { principal: "org_admin", probe: "/rbac/org", status: 200 },
  { principal: "org_admin", probe: "/rbac/admin", status: 200 },
  { principal: "org_admin", probe: "/rbac/agent", status: 200 },
  { principal: "org_admin", probe: "/rbac/reviewer", status: 200 },
  {
    principal: "org_admin",
    probe: "/rbac/platform",
    status: 403,
    code: "platform_admin_required",
  },

  {
    principal: "support_agent",
    probe: "/rbac/org",
    status: 200,
  },
  {
    principal: "support_agent",
    probe: "/rbac/admin",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "support_agent",
    probe: "/rbac/agent",
    status: 200,
  },
  {
    principal: "support_agent",
    probe: "/rbac/reviewer",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "support_agent",
    probe: "/rbac/platform",
    status: 403,
    code: "platform_admin_required",
  },

  { principal: "reviewer", probe: "/rbac/org", status: 200 },
  {
    principal: "reviewer",
    probe: "/rbac/admin",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "reviewer",
    probe: "/rbac/agent",
    status: 403,
    code: "insufficient_role",
  },
  { principal: "reviewer", probe: "/rbac/reviewer", status: 200 },
  {
    principal: "reviewer",
    probe: "/rbac/platform",
    status: 403,
    code: "platform_admin_required",
  },

  { principal: "cross_org_guest", probe: "/rbac/org", status: 200 },
  {
    principal: "cross_org_guest",
    probe: "/rbac/admin",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "cross_org_guest",
    probe: "/rbac/agent",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "cross_org_guest",
    probe: "/rbac/reviewer",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "cross_org_guest",
    probe: "/rbac/platform",
    status: 403,
    code: "platform_admin_required",
  },

  {
    principal: "platform_admin",
    probe: "/rbac/org",
    status: 403,
    code: "no_active_org",
  },
  {
    principal: "platform_admin",
    probe: "/rbac/admin",
    status: 403,
    code: "no_active_org",
  },
  {
    principal: "platform_admin",
    probe: "/rbac/agent",
    status: 403,
    code: "no_active_org",
  },
  {
    principal: "platform_admin",
    probe: "/rbac/reviewer",
    status: 403,
    code: "no_active_org",
  },
  { principal: "platform_admin", probe: "/rbac/platform", status: 200 },
];

describe("RBAC probes", () => {
  let orgAdminClient: Awaited<ReturnType<typeof loginAgent>>;
  let agentClient: Awaited<ReturnType<typeof loginAgent>>;
  let reviewerClient: Awaited<ReturnType<typeof loginAgent>>;
  let guestClient: Awaited<ReturnType<typeof loginAgent>>;
  let platformClient: Awaited<ReturnType<typeof loginAgent>>;

  beforeAll(async () => {
    const org = await createOrg();

    const orgAdmin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const supportAgent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const reviewer = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    const guest = await createUser({
      orgs: [{ org, role: OrgRole.CROSS_ORG_GUEST }],
    });
    const platform = await createUser({ isPlatformAdmin: true });

    orgAdminClient = await loginAgent(orgAdmin.email);
    agentClient = await loginAgent(supportAgent.email);
    reviewerClient = await loginAgent(reviewer.email);
    guestClient = await loginAgent(guest.email);
    platformClient = await loginAgent(platform.email);
  });

  afterAll(async () => {
    await cleanupRunFixtures();
  });

  function clientFor(principal: Principal) {
    switch (principal) {
      case "anonymous":
        return agent();
      case "org_admin":
        return orgAdminClient;
      case "support_agent":
        return agentClient;
      case "reviewer":
        return reviewerClient;
      case "cross_org_guest":
        return guestClient;
      case "platform_admin":
        return platformClient;
      default:
        throw new Error(`Unknown principal: ${principal satisfies never}`);
    }
  }

  it.each(cases)("$principal -> $probe = $status", async ({ principal, probe, status, code }) => {
    const client = clientFor(principal);
    const res = await client.get(probe).expect(status);

    if (code) {
      expect(res.body.code).toBe(code);
    }
  });
});
