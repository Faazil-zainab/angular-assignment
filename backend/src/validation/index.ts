/**
 * Barrel for request validation schemas.
 *
 * Schemas live outside `routes/` so the route table stays declarative and the
 * validation contract of an endpoint can be unit tested on its own.
 */
export * from './auth.schema';
export * from './record.schema';
export * from './user.schema';
