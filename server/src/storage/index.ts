// Public API - Storage facade and types
export { Storage, type Campaign, type Entity, type Event } from './storage.js';

// Internal backend implementations (for initialization only)
export { SqliteStorage } from './sqlite-storage.js';

// Utilities
export * from './ensure-dirs.js';
