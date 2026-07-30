import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
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

let gcsStorage: Storage | undefined;

function getGcsBucket() {
  if (!env.attachmentsGcsBucket) {
    throw new Error(
      "ATTACHMENTS_GCS_BUCKET is required when ATTACHMENTS_BACKEND=gcs",
    );
  }
  if (!gcsStorage) {
    gcsStorage = new Storage();
  }
  return gcsStorage.bucket(env.attachmentsGcsBucket);
}

export async function ensureAttachmentsRoot(): Promise<void> {
  if (env.attachmentsBackend === "gcs") {
    // Bucket is provisioned by Terraform; ADC uses the Cloud Run runtime SA.
    return;
  }
  await mkdir(env.attachmentsDir, { recursive: true });
}

export async function writeAttachmentFile(
  storageKey: string,
  buffer: Buffer,
): Promise<void> {
  assertSafeStorageKey(storageKey);
  if (env.attachmentsBackend === "gcs") {
    await getGcsBucket().file(storageKey).save(buffer, {
      resumable: false,
      validation: false,
    });
    return;
  }
  const fullPath = path.join(env.attachmentsDir, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  assertSafeStorageKey(storageKey);
  if (env.attachmentsBackend === "gcs") {
    try {
      const [buffer] = await getGcsBucket().file(storageKey).download();
      return buffer;
    } catch (error) {
      if (isGcsNotFound(error)) {
        throw new AttachmentStorageError(
          "Attachment file missing",
          "file_missing",
        );
      }
      throw error;
    }
  }
  const fullPath = path.join(env.attachmentsDir, storageKey);
  try {
    return await readFile(fullPath);
  } catch (error) {
    if (isNodeNotFound(error)) {
      throw new AttachmentStorageError("Attachment file missing", "file_missing");
    }
    throw error;
  }
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  assertSafeStorageKey(storageKey);
  if (env.attachmentsBackend === "gcs") {
    try {
      await getGcsBucket().file(storageKey).delete({ ignoreNotFound: true });
    } catch (error) {
      if (isGcsNotFound(error)) {
        console.warn(`Attachment file already missing: ${storageKey}`);
        return;
      }
      throw error;
    }
    return;
  }
  const fullPath = path.join(env.attachmentsDir, storageKey);
  try {
    await unlink(fullPath);
  } catch (error) {
    if (isNodeNotFound(error)) {
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

function isNodeNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function isGcsNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: number | string }).code;
  return code === 404 || code === "404" || code === "ENOENT";
}
