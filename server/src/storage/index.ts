// Public API — Storage facade, types, and test helpers
export {
  Storage,
  type StorageBackend,
  type Campaign,
  type Entity,
  type Event,
  type ServerAdmin,
  type AdminSession,
  type Seat,
  type Invite,
  type AuthSession,
  type PlayerAccount,
} from './storage.js';

// Backend implementations
export { SqliteStorage } from './sqlite-storage.js';
export { InMemoryBackend } from './in-memory-storage.js';

// Utilities
export * from './ensure-dirs.js';
