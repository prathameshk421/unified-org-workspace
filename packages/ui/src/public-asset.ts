/** Prefix a `/public` path with the Next.js basePath (gateway deploy). */
export function publicAsset(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export const ARGUS_MARK_SRC = publicAsset("/argus-mark.svg");
