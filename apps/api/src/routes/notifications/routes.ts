import { Router, type Request, type Response, type Router as RouterType } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../identity/auth/middleware.js";
import { listNotificationsQuerySchema } from "./schemas.js";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationCursorError,
} from "./service.js";

const router: RouterType = Router();

function handleError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }
  if (error instanceof NotificationCursorError) {
    res.status(400).json({ error: error.message, code: "invalid_cursor" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

router.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const q = listNotificationsQuerySchema.parse(req.query);
    const result = await listNotifications(req.auth!.userId, {
      limit: q.limit,
      cursor: q.cursor,
      unreadOnly: q.unreadOnly,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/notifications/unread-count", requireAuth, async (req: Request, res: Response) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const count = await getUnreadCount(req.auth!.userId);
    res.json({ count });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing notification id" });
      return;
    }
    const ok = await markNotificationRead(req.auth!.userId, id);
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    await markAllNotificationsRead(req.auth!.userId);
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

export { router as notificationsRouter };
