import {
  TICKET_STATUS_TRANSITIONS,
  type TicketStatus,
} from "@unified/types";

export function isValidStatusTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return TICKET_STATUS_TRANSITIONS[from].includes(to);
}

export { TICKET_STATUS_TRANSITIONS };
