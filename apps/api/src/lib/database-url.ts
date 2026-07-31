/**
 * Prisma defaults connect_timeout to 5s. Cloud Run + Direct VPC egress can
 * take a minute+ before private Cloud SQL is reachable on cold start.
 *
 * Avoid URL parsing so passwords with reserved characters stay intact.
 */
export function withConnectTimeout(
  databaseUrl: string,
  connectTimeoutSeconds = 60,
): string {
  if (/[?&]connect_timeout=/.test(databaseUrl)) {
    return databaseUrl;
  }
  const sep = databaseUrl.includes("?") ? "&" : "?";
  return `${databaseUrl}${sep}connect_timeout=${connectTimeoutSeconds}`;
}
