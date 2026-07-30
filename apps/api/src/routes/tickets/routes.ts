import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { ZodError } from "zod";
import {
  AuditAction,
  TICKET_MUTATOR_ROLES,
  TICKET_READER_ROLES,
} from "@unified/types";
import { queueAudit } from "../../middleware/audit-mutations.js";
import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requireRole,
} from "../identity/auth/middleware.js";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
  updateTicketStatusSchema,
} from "./schemas.js";
import { registerAttachmentRoutes } from "./attachments-routes.js";
import { registerCommentRoutes } from "./comments-routes.js";
import {
  TicketError,
  createTicket,
  deleteTicket,
  getOrgTicketOrThrow,
  listTickets,
  toTicketResponse,
  truncateForAudit,
  updateTicket,
  updateTicketStatus,
} from "./service.js";

const router: RouterType = Router();

registerCommentRoutes(router);
registerAttachmentRoutes(router);

function handleTicketError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof TicketError) {
    const body: { error: string; code?: string } = { error: error.message };
    if (error.code) {
      body.code = error.code;
    }
    res.status(error.statusCode).json(body);
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

router.get(
  "/tickets",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_READER_ROLES),
  async (req: Request, res: Response) => {
    try {
      const query = listTicketsQuerySchema.parse(req.query);
      const tickets = await listTickets(req.orgId!, query.status);
      res.json({ tickets });
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

router.get(
  "/tickets/:id",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_READER_ROLES),
  async (req: Request, res: Response) => {
    try {
      const ticket = await getOrgTicketOrThrow(req.params.id!, req.orgId!);
      res.json(toTicketResponse(ticket));
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

router.post(
  "/tickets",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const body = createTicketSchema.parse(req.body);
      const ticket = await createTicket({
        orgId: req.orgId!,
        createdById: req.auth!.userId,
        title: body.title,
        description: body.description,
        assigneeId: body.assigneeId,
      });

      queueAudit(req, res, {
        action: AuditAction.TICKET_CREATE,
        entityType: "Ticket",
        entityId: ticket.id,
        metadata: {
          title: truncateForAudit(ticket.title),
          status: ticket.status,
          assigneeId: ticket.assigneeId,
        },
      });

      res.status(201).json(ticket);
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

router.patch(
  "/tickets/:id/status",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const body = updateTicketStatusSchema.parse(req.body);
      const { ticket, from, to } = await updateTicketStatus(
        req.params.id!,
        req.orgId!,
        body.status,
      );

      if (from !== to) {
        queueAudit(req, res, {
          action: AuditAction.TICKET_STATUS_CHANGE,
          entityType: "Ticket",
          entityId: ticket.id,
          metadata: {
            title: truncateForAudit(ticket.title),
            from,
            to,
          },
        });
      }

      res.json(ticket);
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

router.patch(
  "/tickets/:id",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
  requireJsonContentType,
  async (req: Request, res: Response) => {
    try {
      const body = updateTicketSchema.parse(req.body);
      const { ticket, changedFields } = await updateTicket(
        req.params.id!,
        req.orgId!,
        body,
      );

      if (changedFields.length > 0) {
        queueAudit(req, res, {
          action: AuditAction.TICKET_UPDATE,
          entityType: "Ticket",
          entityId: ticket.id,
          metadata: {
            title: truncateForAudit(ticket.title),
            changedFields,
            assigneeId: ticket.assigneeId,
          },
        });
      }

      res.json(ticket);
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

router.delete(
  "/tickets/:id",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_MUTATOR_ROLES),
  async (req: Request, res: Response) => {
    try {
      const ticket = await deleteTicket(req.params.id!, req.orgId!);

      queueAudit(req, res, {
        action: AuditAction.TICKET_DELETE,
        entityType: "Ticket",
        entityId: ticket.id,
        metadata: {
          title: truncateForAudit(ticket.title),
          status: ticket.status,
        },
      });

      res.status(204).send();
    } catch (error) {
      handleTicketError(res, error);
    }
  },
);

export { router as ticketsRouter };
