import type { AuthContext } from "../routes/identity/auth/types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /**
       * Active org ID for org-scoped handlers. Set only by `requireOrgAccess`
       * from verified session/JWT — never from client params, query, or body.
       */
      orgId?: string;
    }
  }
}

export {};
