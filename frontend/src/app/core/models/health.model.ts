/** Payload of `GET /api/health`, mirroring the backend `HealthReport`. */
export interface HealthReport {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  startedAt: string;
  timestamp: string;
  nodeVersion: string;
  apiDelayMs: number;
  storageDriver: string;
  /** Absolute paths of the JSON documents the backend's local store uses. */
  storageFiles: string[];
}

/** Connection state of the backend, as surfaced by the app shell. */
export type ApiStatus = 'checking' | 'online' | 'offline';
