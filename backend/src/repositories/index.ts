/**
 * Barrel for the persistence layer.
 *
 * Repositories are the only modules that touch `fs` or `JSON.*`. Services depend on
 * them (never the other way round), which keeps the layering
 * `route -> controller -> service -> repository -> JSON file` one-directional.
 */
export * from './json.repository';
export * from './record.repository';
export * from './user.repository';
