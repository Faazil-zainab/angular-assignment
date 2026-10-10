import type { Request, Response } from 'express';

import { healthService } from '../services/health.service';
import { sendSuccess } from '../utils/http-response';

/**
 * Controllers only translate HTTP <-> service calls. No business rules and no
 * response shaping live here, which keeps them trivially unit testable.
 */
export class HealthController {
  /** `GET /api/health` - liveness/readiness probe. */
  getHealth = (_req: Request, res: Response): void => {
    sendSuccess(res, healthService.getReport());
  };
}

export const healthController = new HealthController();
