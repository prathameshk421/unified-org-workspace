import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../lib/env.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.attachmentMaxBytes,
    files: 1,
  },
});

export const singleFileUpload: RequestHandler = upload.single("file");
