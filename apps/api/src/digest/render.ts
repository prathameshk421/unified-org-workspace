import type { DigestFacts } from "./types.js";
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
