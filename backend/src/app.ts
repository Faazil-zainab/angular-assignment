import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { config } from './config/env.config';
import { apiDelay } from './middleware/api-delay.middleware';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/not-found.middleware';
import { requestContext } from './middleware/request-context.middleware';
import { requestLogger } from './middleware/request-logger.middleware';
import { apiRouter } from './routes';
import { ApiError } from './utils/api-error';
import { logger } from './utils/logger';

const log = logger.child('app');

/**
 * CORS policy: an explicit allow list from `CORS_ORIGINS`.
 *
 * Requests without an `Origin` header (curl, health checks, server-to-server)
 * are always allowed; anything else must be listed, otherwise the request is
 * rejected through the normal error pipeline.
 */
function buildCorsOptions(): CorsOptions {
  const allowAll = config.corsOrigins.includes('*');

  return {
    origin(origin, callback) {
      if (!origin || allowAll || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(
        ApiError.forbidden(`Origin "${origin}" is not allowed by the CORS policy.`, {
          code: 'CORS_ORIGIN_DENIED',
        }),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Client-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  };
}

/**
 * Builds the Express application without binding a port.
 *
 * Keeping creation and listening separate lets the tests mount the real app on
 * an ephemeral port and lets a future serverless entry point reuse it.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // --- Cross cutting -------------------------------------------------------
  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimit }));

  // The order below matters: context -> latency -> access log -> routes.
  app.use(requestContext());
  app.use(apiDelay());
  app.use(requestLogger());

  // --- Routes --------------------------------------------------------------
  app.use(config.apiPrefix, apiRouter);

  // --- Terminal ------------------------------------------------------------
  app.use(notFound());
  app.use(errorHandler());

  log.debug('application assembled', {
    apiPrefix: config.apiPrefix,
    corsOrigins: config.corsOrigins,
    apiDelayMs: config.apiDelayMs,
  });

  return app;
}
