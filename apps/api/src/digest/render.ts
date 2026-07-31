import type { DigestFacts, DigestFactItem } from "./types.js";
import { isDigestEmpty } from "./types.js";

export function renderDigestNotification(facts: DigestFacts): {
  title: string;
  body: string;
} {
  if (isDigestEmpty(facts)) {
    return { title: "You're all caught up", body: "No open items need your attention." };
  }

  const parts: string[] = [];

  if (facts.assignedTicketCount > 0) {
    const stale =
      facts.staleAssignedTicketCount > 0
        ? ` (${facts.staleAssignedTicketCount} stale)`
        : "";
    parts.push(
      `You have ${facts.assignedTicketCount} ticket${facts.assignedTicketCount === 1 ? "" : "s"} assigned to you${stale}`,
    );
  }

  if (facts.waitingPrCount > 0) {
    const idle =
      facts.oldestWaitingPrIdleDays != null && facts.oldestWaitingPrIdleDays > 0
        ? `; oldest is ${facts.oldestWaitingPrIdleDays} day${facts.oldestWaitingPrIdleDays === 1 ? "" : "s"} idle`
        : "";
    parts.push(
      `${facts.waitingPrCount} PR${facts.waitingPrCount === 1 ? "" : "s"} waiting on your review${idle}`,
    );
  }

  if (facts.sharedTicketCount > 0 || facts.sharedPrCount > 0) {
    const bits: string[] = [];
    if (facts.sharedTicketCount > 0) {
      bits.push(
        `${facts.sharedTicketCount} shared ticket${facts.sharedTicketCount === 1 ? "" : "s"}`,
      );
    }
    if (facts.sharedPrCount > 0) {
      bits.push(
        `${facts.sharedPrCount} shared PR${facts.sharedPrCount === 1 ? "" : "s"}`,
      );
    }
    parts.push(`Also: ${bits.join(" and ")}`);
  }

  const body = parts.join(". ") + ".";
  return {
    title: "Your progress digest",
    body,
  };
}

function itemsBySignal(
  items: DigestFactItem[],
  signals: DigestFactItem["signal"][],
): DigestFactItem[] {
  return items.filter((item) => signals.includes(item.signal));
}

function formatItemBullet(item: DigestFactItem): string {
  const kind = item.kind === "ticket" ? "Ticket" : "PR";
  return `- ${kind}: ${item.title} (${item.orgName})`;
}

function formatSection(
  header: string,
  items: DigestFactItem[],
  summaryLine?: string,
): string[] {
  if (items.length === 0 && !summaryLine) {
    return [];
  }
  const lines = [header];
  if (summaryLine) {
    lines.push(summaryLine);
  }
  for (const item of items) {
    lines.push(formatItemBullet(item));
  }
  return lines;
}

/** Plain-text email fallback when LLM is unavailable. */
export function renderDigestEmailNotification(facts: DigestFacts): {
  title: string;
  body: string;
} {
  if (isDigestEmpty(facts)) {
    return {
      title: "Your progress digest — all caught up",
      body: [
        "Hello,",
        "",
        "You're all caught up — no open items need your attention right now.",
        "",
        "Best regards,",
        "Argus",
        "Unified Org Workspace",
      ].join("\n"),
    };
  }

  const assignedItems = itemsBySignal(facts.items, ["assigned", "stale_assigned"]);
  const waitingItems = itemsBySignal(facts.items, ["waiting_review"]);
  const sharedItems = itemsBySignal(facts.items, ["shared"]);

  const sections: string[] = [];

  if (facts.assignedTicketCount > 0) {
    const staleNote =
      facts.staleAssignedTicketCount > 0
        ? `${facts.staleAssignedTicketCount} of these are stale and need follow-up.`
        : undefined;
    sections.push(
      ...formatSection(
        "ASSIGNED TICKETS",
        assignedItems,
        `You have ${facts.assignedTicketCount} ticket${facts.assignedTicketCount === 1 ? "" : "s"} assigned to you.${staleNote ? ` ${staleNote}` : ""}`,
      ),
    );
  }

  if (facts.waitingPrCount > 0) {
    const idleNote =
      facts.oldestWaitingPrIdleDays != null && facts.oldestWaitingPrIdleDays > 0
        ? `The oldest has been idle for ${facts.oldestWaitingPrIdleDays} day${facts.oldestWaitingPrIdleDays === 1 ? "" : "s"}.`
        : undefined;
    sections.push(
      ...formatSection(
        "PULL REQUESTS WAITING ON YOU",
        waitingItems,
        `${facts.waitingPrCount} PR${facts.waitingPrCount === 1 ? "" : "s"} await your review.${idleNote ? ` ${idleNote}` : ""}`,
      ),
    );
  }

  if (facts.sharedTicketCount > 0 || facts.sharedPrCount > 0) {
    const sharedSummary: string[] = [];
    if (facts.sharedTicketCount > 0) {
      sharedSummary.push(
        `${facts.sharedTicketCount} shared ticket${facts.sharedTicketCount === 1 ? "" : "s"}`,
      );
    }
    if (facts.sharedPrCount > 0) {
      sharedSummary.push(
        `${facts.sharedPrCount} shared PR${facts.sharedPrCount === 1 ? "" : "s"}`,
      );
    }
    sections.push(
      ...formatSection(
        "SHARED WITH YOU",
        sharedItems,
        `You have ${sharedSummary.join(" and ")} shared with you.`,
      ),
    );
  }

  const body = [
    "Hello,",
    "",
    "Here is your progress digest from Argus.",
    "",
    ...sections,
    "",
    "Stay on top of your workload,",
    "Argus",
    "Unified Org Workspace",
  ].join("\n");

  return {
    title: "Your progress digest from Argus",
    body,
  };
}
