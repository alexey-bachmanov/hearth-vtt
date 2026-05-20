---
agent: agent
description: Write integration tests for server/src/routes/campaigns.ts
---

# Task: Write Campaign Route Integration Tests

Create `server/src/routes/campaigns.test.ts` with full integration test coverage for the campaign CRUD endpoints.

## Reference materials — read these first

1. **Reference test** (copy the infrastructure patterns exactly):
   `server/src/routes/admin-auth.test.ts`

2. **Source under test**:
   `server/src/routes/campaigns.ts`

## What the routes do

```
GET    /api/campaigns        → { campaigns: Campaign[] }   — public, no auth
GET    /api/campaigns/:id    → Campaign | 404               — public, no auth
POST   /api/campaigns        → 201 { campaign }             — requires session cookie + X-CSRF-Token
DELETE /api/campaigns/:id    → 204                          — requires session cookie + X-CSRF-Token
```

Protected routes use `requireAdminAuth` (checks `hearth_admin_session` cookie, returns 401 if missing/invalid)
then `requireCsrfToken` (checks `X-CSRF-Token` header, returns 403 if missing).

POST returns 400 `INVALID_NAME` if `name` is missing, empty string, or whitespace-only.
GET /:id and DELETE /:id return 404 `CAMPAIGN_NOT_FOUND` if the campaign doesn't exist.

## Infrastructure to copy from the reference test

Copy these four patterns verbatim from `admin-auth.test.ts`:

1. **Module-level env setup** (top of file, before any imports take effect):

   ```ts
   process.env.NODE_ENV = 'development';
   process.env.ADMIN_ALLOW_REMOTE = 'true';
   process.env.COOKIE_SECRET =
     'test-cookie-secret-value-must-be-at-least-32-chars';
   ```

2. **`createTestServer()`** helper — `new Storage(new InMemoryBackend())` + `buildServer({ dataDir: tmpdir(), storage, logger: false })`

3. **`seedAdmin()` + `setupViaApi()`** helpers — needed to bootstrap an authenticated session for protected route tests

4. **Cookie extraction** from `Set-Cookie` header: `rawSetCookie.split(';')[0].trim()`

## Imports

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';
import { Storage, InMemoryBackend } from '../storage/index.js';
import { buildServer } from '../server.js';
import { hashPin } from '../auth/setup-pin.js';
```

## Test cases to implement

### `GET /api/campaigns`

- Returns `{ campaigns: [] }` when no campaigns exist
- Returns all campaigns after one is created (seed directly via `storage.createCampaign()`)

### `GET /api/campaigns/:id`

- Returns the campaign object when it exists
- Returns 404 `CAMPAIGN_NOT_FOUND` for an unknown ID

### `POST /api/campaigns` — auth guards

- Returns 401 when no session cookie is provided
- Returns 403 `CSRF_TOKEN_MISSING` when cookie is present but `X-CSRF-Token` header is absent

### `POST /api/campaigns` — happy path & validation

- Returns 201 with a `campaign` object containing the given `name` on success
- Returns 400 `INVALID_NAME` when `name` is empty string `""`
- Returns 400 `INVALID_NAME` when `name` is whitespace only `"   "`
- Returns 400 `INVALID_NAME` when `name` field is missing from the body

### `DELETE /api/campaigns/:id` — auth guards

- Returns 401 when no session cookie is provided

### `DELETE /api/campaigns/:id` — happy path

- Returns 204 and the campaign no longer appears in `GET /api/campaigns`
- Returns 404 `CAMPAIGN_NOT_FOUND` for an unknown ID (with valid auth)

## Suite structure

Use one shared server + storage for the entire file (single `beforeAll` / `afterAll`).
Bootstrap an authenticated session in `beforeAll` so protected-route tests can reuse it.
Seed any campaign data needed inside individual tests using `storage.createCampaign()` directly
(faster than going through the API, and auth is already tested separately).

Use unique `remoteAddress` values per test (e.g. `'10.10.0.1'`, `'10.10.0.2'`, …) so the
module-level rate limit map in admin-auth does not interfere.

## Definition of done

- File created at `server/src/routes/campaigns.test.ts`
- `cd server && npx vitest run` exits 0 with all new tests passing
- No changes to any source files — test-only addition
