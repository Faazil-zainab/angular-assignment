import type { Request, Response } from 'express';

import { readBody } from '../middleware/validate.middleware';
import type { LoginRequest } from '../models';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/http-response';

/**
 * HTTP surface of authentication.
 *
 * The controller does three things only: read the already validated body, call the
 * service, and shape the response. All credential handling lives in
 * `AuthService`, so this class stays trivial to review.
 */
export class AuthController {
  /** `POST /api/auth/login` - 200 with a token, 400/401/403 on failure. */
  login = async (req: Request, res: Response): Promise<void> => {
    const credentials = readBody<LoginRequest>(req);
    const result = await authService.login(credentials);

    sendSuccess(res, result, 200);
  };
}

export const authController = new AuthController();
