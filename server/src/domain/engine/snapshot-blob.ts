/**
 * Engine-internal snapshot blob type.
 *
 * Defines the shape of the data stored via `storage.putSnapshot`. Kept in a
 * co-located file so both `placeholder.ts` and dev tooling (e.g. `dev-seed.ts`)
 * can share the type without leaking it to the engine's public API surface or
 * to the `shared/` package.
 *
 * IMPORTANT: this type must NOT be re-exported from `server/src/domain/engine/index.ts`.
 * Consumers outside the engine directory should interact with snapshot data
 * only through the opaque `blob: unknown` of the storage interface.
 */

import type { Token, Actor, Scene } from '@hearth-vtt/shared';

/**
 * Shape of the blob written by `storage.putSnapshot` and read by
 * `PlaceholderEngine.open()`.
 *
 * `seats` are excluded on purpose: they are always reloaded from storage on
 * `open()` so seat changes (role updates, new invites) take effect without
 * requiring a new snapshot.
 *
 * `schemaVersion` is a forward-compatibility guard. The engine must reject
 * blobs whose `schemaVersion` it does not recognise.
 */
export interface SnapshotBlobV1 {
  schemaVersion: 1;
  activeSceneId: string | null;
  scenes: Record<string, Scene>;
  tokens: Record<string, Token>;
  actors: Record<string, Actor>;
}
