/**
 * Seat role type and schema.
 *
 * Canonical definition used by both server and client.
 * Null/absent role is expressed at call sites as `SeatRole | null`.
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
 * Use `SeatRole | null` at call sites where no seat is assigned.
 */
export type SeatRole = z.infer<typeof seatRoleSchema>;
