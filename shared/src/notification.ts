/**
 * Notification types shared across server and client.
 *
 * Defines the 2×2 notification model:
 *   origin: 'server' | 'client'  ×  lifetime: 'persistent' | 'ephemeral'
 *
 * |             | Persistent               | Ephemeral                          |
 * |-------------|--------------------------|------------------------------------|
 * | **Server**  | Prompts (promptId refs)  | Feed entries ("X attacked Y")      |
 * | **Client**  | Offline indicators, etc. | Toasts ("Roll saved", "Connected") |
 *
 * Notification _state_ is client-owned (client/src/state/notifications.svelte.ts).
 * These schemas exist in shared so server can annotate messages with origin
 * if needed, and so client and server agree on the model.
 */

import { z } from 'zod';

/**
 * Where a notification originates.
 *
 * - `server`: Notification reflects server-owned state (prompts, feed entries).
 *   Survives reconnect because the server re-sends the state.
 * - `client`: Notification is client-local (toasts, offline indicators).
 *   Does not survive reconnect.
 */
export const notificationOriginSchema = z.enum(['server', 'client']);
export type NotificationOrigin = z.infer<typeof notificationOriginSchema>;

/**
 * How long a notification lives.
 *
 * - `ephemeral`: Auto-dismissed after a timeout (toasts, feed entries).
 * - `persistent`: Stays until explicitly dismissed or acted upon (prompts,
 *   offline indicators).
 */
export const notificationLifetimeSchema = z.enum(['ephemeral', 'persistent']);
export type NotificationLifetime = z.infer<typeof notificationLifetimeSchema>;
