import { config } from '../config/env.config';
import { DEMO_RECORDS, DEMO_USERS, seedService } from '../services/seed.service';
import { logger } from '../utils/logger';

/**
 * `npm run seed` - creates (or resets) the development data set in
 * `backend/data/users.json` and `backend/data/records.json`.
 *
 * Overwrites the seeded accounts and records so a forgotten password or an edited
 * fixture can be restored; every other entry in either document is left untouched.
 */
async function main(): Promise<void> {
  const outcome = await seedService.resetDevelopmentData();

  logger.info('seed finished', {
    usersFile: config.storage.usersFile,
    recordsFile: config.storage.recordsFile,
    usersCreated: outcome.users.created,
    usersReset: outcome.users.reset,
    recordsCreated: outcome.records.created,
    recordsUpdated: outcome.records.updated,
  });

  logger.info(
    `seeded ${DEMO_USERS.length} users and ${DEMO_RECORDS.length} records - ` +
      `sign in with: ${DEMO_USERS.map((user) => `${user.userId} (${user.role})`).join(', ')}. ` +
      'Passwords are listed in backend/README.md',
  );
}

main().catch((error: unknown) => {
  logger.error('seed failed', {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
