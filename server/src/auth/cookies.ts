/**
 * Refresh-cookie policy helpers.
 *
 * The cookie lifetime depends on the transport:
 *   - HTTPS (production or TRUST_PROXY): 30 days by default (persistent)
 *   - HTTP (dev without proxy): session-only (browser discards on close)
 *
 * An admin can override the default persistent lifetime via
 * `storage.setServerSetting('refresh_cookie_max_days', '<0-30>')`.
 * 0 = session-only cookie even on HTTPS.
 *
 * Usage:
 *   const options = await buildRefreshCookieOptions(request, storage);
 *   reply.setCookie('hearth_refresh', token, options);
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Storage } from '../storage/storage.js';

export const REFRESH_COOKIE_NAME = 'hearth_refresh';

/** Default persistent lifetime in days when HTTPS is detected. */
const DEFAULT_MAX_DAYS = 30;

/**
 * Returns true if the current request arrived over HTTPS (directly or via a
 * trusted reverse proxy).  Relies on Fastify's `request.protocol` which
 * already honours `trustProxy` configuration.
 */
function isHttps(request: FastifyRequest): boolean {
  return request.protocol === 'https';
}

/**
 * Build the CookieSerializeOptions for the `hearth_refresh` cookie.
 *
 * - Always HttpOnly + SameSite=Lax + path=/
 * - Secure flag only when HTTPS is detected
 * - maxAge: admin-configured (0–30 days) when on HTTPS; absent (session) otherwise
 */
export async function buildRefreshCookieOptions(
  request: FastifyRequest,
  storage: Storage,
): Promise<Parameters<FastifyReply['setCookie']>[2]> {
  const https = isHttps(request);

  let maxAge: number | undefined;
  if (https) {
    // Default: 30 days.  Admin may override via server setting.
    let days = DEFAULT_MAX_DAYS;
    const raw = await storage.getServerSetting('refresh_cookie_max_days');
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 30) {
        days = parsed;
      }
    }
    maxAge = days === 0 ? undefined : days * 24 * 60 * 60;
  }

  return {
    httpOnly: true,
    secure: https,
    sameSite: 'lax',
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
