import { Router } from 'express';

import { authRouter } from './auth.routes';
import { healthRouter } from './health.routes';
import { recordRouter } from './record.routes';
import { userRouter } from './user.routes';

/**
 * Single mount point for the version-less `/api` surface.
 *
 * Every feature owns one router module and is attached here, so `app.ts` never needs
 * to change when a feature is added.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/records', recordRouter);
