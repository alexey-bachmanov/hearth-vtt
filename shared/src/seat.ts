/**
 * Seat role type and schema.
 *
 * Canonical definition used by both server and client.
 */

import { z } from 'zod';

export const seatRoleSchema = z.enum(['gm', 'player', 'spectator']);

/**
 * Campaign role for a seat.
 *
 * - gm: Game master with full permissions
 * - player: Player with limited permissions
 * - spectator: Observer with read-only access
 *
 * Null indicates no role assigned (e.g. not connected or connection lost).
 */
export type SeatRole = z.infer<typeof seatRoleSchema> | null;
