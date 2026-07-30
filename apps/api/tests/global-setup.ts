import { assertAppRole, cleanupStaleFixtures, disconnectDatabases } from "./support/db.js";

export default async function globalSetup(): Promise<() => Promise<void>> {
  await cleanupStaleFixtures();
  await assertAppRole();

  return async () => {
    await disconnectDatabases();
  };
}
