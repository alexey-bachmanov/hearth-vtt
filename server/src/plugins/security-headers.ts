/**
 * Security response headers.
 *
 * Call `registerSecurityHeaders(server)` once in `server.ts` *before*
 * registering routes; the `onSend` hook is attached to the root scope so
 * every response carries the headers.
 *
 * Headers applied:
 *   X-Content-Type-Options: nosniff      — prevent MIME sniffing
 *   X-Frame-Options: DENY                — prevent clickjacking
 *   Referrer-Policy: strict-origin-when-cross-origin
 *   Content-Security-Policy-Report-Only  — report-only first; flip to
 *                                          enforcing once all UI routes
 *                                          are verified clean.
 *
 * CSP policy:
 *   - default-src 'self'
 *   - script-src 'self'    (no inline scripts, no eval)
 *   - style-src  'self'
 *   - img-src    'self' data: blob:   (WebGL canvas exports blobs)
 *   - connect-src 'self' ws: wss:    (WS connections to same host)
 *   - font-src   'self'
 *   - object-src 'none'
 *   - frame-ancestors 'none'
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Attach security response headers to every reply on the given Fastify
 * instance.  Must be called before routes are registered so the `onSend`
 * hook applies at root scope.
 */
export function registerSecurityHeaders(server: FastifyInstance): void {
  server.addHook(
    'onSend',
    async (
      _req: FastifyRequest,
      reply: FastifyReply,
      _payload: unknown,
    ): Promise<void> => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
    },
  );
}
