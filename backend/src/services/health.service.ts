import { config } from '../config/env.config';
import type { HealthReport } from '../models';

/** Captured once, when the process starts. */
const STARTED_AT = new Date();

/**
 * Produces the liveness report consumed by `GET /api/health`.
 *
 * Keeping it in a service (rather than inlining the object in the controller)
 * matches the layering used by every other feature: routes -> controller ->
 * service.
 */
export class HealthService {
  getReport(): HealthReport {
    return {
      status: 'ok',
      service: config.appName,
      version: config.appVersion,
      environment: config.nodeEnv,
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      startedAt: STARTED_AT.toISOString(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      apiDelayMs: config.apiDelayMs,
      storageDriver: config.storage.driver,
      storageFiles: [config.storage.usersFile, config.storage.recordsFile],
    };
  }
}

export const healthService = new HealthService();
