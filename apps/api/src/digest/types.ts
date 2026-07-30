export type DigestFactSignal =
  | "assigned"
  | "stale_assigned"
  | "waiting_review"
  | "shared";

export type DigestFactItem = {
  kind: "ticket" | "pull_request";
  id: string;
  title: string;
  orgId: string;
  orgName: string;
  signal: DigestFactSignal;
};

export type DigestFacts = {
  userId: string;
  collectedAt: string;
  allowedOrgIds: string[];
  assignedTicketCount: number;
  staleAssignedTicketCount: number;
  waitingPrCount: number;
  oldestWaitingPrIdleDays: number | null;
  sharedTicketCount: number;
  sharedPrCount: number;
  items: DigestFactItem[];
};

export type DigestThresholds = {
  staleDays: number;
  idleDays: number;
};

export function emptyDigestFacts(userId: string): DigestFacts {
  return {
    userId,
    collectedAt: new Date().toISOString(),
    allowedOrgIds: [],
    assignedTicketCount: 0,
    staleAssignedTicketCount: 0,
    waitingPrCount: 0,
    oldestWaitingPrIdleDays: null,
    sharedTicketCount: 0,
    sharedPrCount: 0,
    items: [],
  };
}

export function isDigestEmpty(facts: DigestFacts): boolean {
  return (
    facts.assignedTicketCount === 0 &&
    facts.staleAssignedTicketCount === 0 &&
    facts.waitingPrCount === 0 &&
    facts.sharedTicketCount === 0 &&
    facts.sharedPrCount === 0 &&
    facts.items.length === 0
  );
}

export function resourceRef(
  kind: "ticket" | "pull_request",
  id: string,
): string {
  return kind === "ticket" ? `ticket:${id}` : `pr:${id}`;
}

export function resourceIdsFromFacts(facts: DigestFacts): string[] {
  return [...new Set(facts.items.map((i) => resourceRef(i.kind, i.id)))];
}
