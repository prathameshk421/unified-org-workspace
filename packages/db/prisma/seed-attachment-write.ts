import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultAttachmentsRoot = path.resolve(__dirname, "../../../data/attachments");

function resolveAttachmentsBackend(): "fs" | "gcs" {
  const explicit = process.env.ATTACHMENTS_BACKEND?.trim().toLowerCase();
  if (explicit === "gcs") return "gcs";
  if (explicit === "fs" || explicit === "filesystem") return "fs";
  if (process.env.ATTACHMENTS_GCS_BUCKET?.trim()) return "gcs";
  return "fs";
}

export async function writeSeedAttachmentFile(
  storageKey: string,
  buffer: Buffer,
): Promise<void> {
  if (
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    path.isAbsolute(storageKey)
  ) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }

  if (resolveAttachmentsBackend() === "gcs") {
    const bucketName = process.env.ATTACHMENTS_GCS_BUCKET?.trim();
    if (!bucketName) {
      throw new Error("ATTACHMENTS_GCS_BUCKET is required when backend=gcs");
    }
    const storage = new Storage();
    await storage.bucket(bucketName).file(storageKey).save(buffer, {
      resumable: false,
      validation: false,
    });
    console.log(`Seed attachment written to GCS gs://${bucketName}/${storageKey}`);
    return;
  }

  const attachmentsRoot =
    process.env.ATTACHMENTS_DIR?.trim() || defaultAttachmentsRoot;
  const fullPath = path.join(attachmentsRoot, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  console.log(`Seed attachment written to ${fullPath}`);
}
