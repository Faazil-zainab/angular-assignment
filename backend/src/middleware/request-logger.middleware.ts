import type { RequestHandler } from 'express';

import { elapsedMs, getRequestContext } from '../utils/request-context';
import { logger } from '../utils/logger';

const log = logger.child('http');

/**
 * Logs one line per completed request (method, path, status, duration).
 * 4xx responses are logged as warnings and 5xx as errors.
 */
export function requestLogger(): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const context = getRequestContext(res);
      const meta = {
        requestId: context.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: elapsedMs(res),
        delayMs: context.delayMs,
        ip: req.ip,
      };

      if (res.statusCode >= 500) {
        log.error('request failed', meta);
      } else if (res.statusCode >= 400) {
        log.warn('request rejected', meta);
      } else {
        log.info('request completed', meta);
      }
    });

    next();
  };
}
