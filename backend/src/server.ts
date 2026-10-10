import type { Server } from 'node:http';

import { createApp } from './app';
import { config } from './config/env.config';
import { seedService } from './services/seed.service';
import { errorMeta, logger } from './utils/logger';

const log = logger.child('server');

/** How long in-flight requests get to finish after a shutdown signal. */
const SHUTDOWN_GRACE_MS = 10_000;

function registerShutdownHooks(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info(`${signal} received, shutting down gracefully`, { graceMs: SHUTDOWN_GRACE_MS });

    const forceExit = setTimeout(() => {
      log.warn('graceful shutdown timed out, exiting forcefully');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    server.close((error) => {
      clearTimeout(forceExit);
      if (error) {
        log.error('error while closing the HTTP server', errorMeta(error));
        process.exit(1);
      }
      log.info('HTTP server closed, bye');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function registerProcessHooks(): void {
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled promise rejection', errorMeta(reason));
  });

  process.on('uncaughtException', (error) => {
    log.error('uncaught exception, exiting', errorMeta(error));
    process.exit(1);
  });
}

function listen(): void {
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log.info(`${config.appName} v${config.appVersion} listening`, {
      url: `http://localhost:${config.port}${config.apiPrefix}`,
      environment: config.nodeEnv,
      node: process.version,
      apiDelayMs: config.apiDelayMs,
      storage: config.storage.directory,
    });
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      log.error(`Port ${config.port} is already in use. Stop the other process or change PORT in backend/.env.`);
    } else {
      log.error('HTTP server error', errorMeta(error));
    }
    process.exit(1);
  });

  registerShutdownHooks(server);
  registerProcessHooks();
}

/**
 * Boot sequence: make sure the development data set exists before accepting traffic,
 * so a fresh checkout can sign in straight away.
 *
 * Seeding only ever *creates what is missing* - it never replaces an existing
 * document - which is what guarantees that restarting the backend leaves users and
 * records intact. It is a no-op when `SEED_USERS=false`.
 */
async function start(): Promise<void> {
  const outcome = await seedService.ensureDevelopmentData();

  if (outcome !== undefined && outcome.records.created.length > 0) {
    log.info('development records are ready', { created: outcome.records.created });
  }

  listen();
}

start().catch((error: unknown) => {
  log.error('failed to start the API', errorMeta(error));
  process.exit(1);
});
