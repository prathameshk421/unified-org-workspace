import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";

export class AttachmentStorageError extends Error {
  constructor(
    message: string,
    readonly code: "file_missing" | "invalid_storage_key",
  ) {
    super(message);
    this.name = "AttachmentStorageError";
  }
}

function assertSafeStorageKey(storageKey: string): void {
  if (
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    path.isAbsolute(storageKey)
  ) {
    throw new AttachmentStorageError(
      "Invalid storage key",
      "invalid_storage_key",
    );
  }
}

export function sanitizeFileName(originalFileName: string): string {
  const base = path.basename(originalFileName);
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return sanitized.length > 0 ? sanitized : "file";
}

export function buildStorageKey(
  orgId: string,
  ticketId: string,
  attachmentId: string,
  originalFileName: string,
): string {
  const sanitized = sanitizeFileName(originalFileName);
  const key = `${orgId}/${ticketId}/${attachmentId}_${sanitized}`;
  assertSafeStorageKey(key);
  return key;
}

export async function ensureAttachmentsRoot(): Promise<void> {
  await mkdir(env.attachmentsDir, { recursive: true });
}

export async function writeAttachmentFile(
  storageKey: string,
  buffer: Buffer,
): Promise<void> {
  assertSafeStorageKey(storageKey);
  const fullPath = path.join(env.attachmentsDir, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  assertSafeStorageKey(storageKey);
  const fullPath = path.join(env.attachmentsDir, storageKey);
  try {
    return await readFile(fullPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw new AttachmentStorageError("Attachment file missing", "file_missing");
    }
    throw error;
  }
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  assertSafeStorageKey(storageKey);
  const fullPath = path.join(env.attachmentsDir, storageKey);
  try {
    await unlink(fullPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      console.warn(`Attachment file already missing: ${storageKey}`);
      return;
    }
    throw error;
  }
}

export async function deleteTicketAttachmentFiles(
  storageKeys: string[],
): Promise<void> {
  await Promise.all(storageKeys.map((key) => deleteAttachmentFile(key)));
}
