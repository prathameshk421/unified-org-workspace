import type { AuthContext } from "../routes/identity/auth/types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
