# Testing — HearthVTT (`docs/testing.md`)

This document defines testing strategy, guidelines, tooling decisions, and contracts for HearthVTT.

---

## Strategy Overview

HearthVTT uses a three-tier testing model:

| Tier            | What                                                                                                     | Tooling                          | Volume                            |
| --------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------- |
| **Unit**        | Pure functions, state class logic, route handlers with mocked storage                                    | Vitest                           | ~80%                              |
| **Integration** | SQLite storage with `:memory:` DB, full HTTP request/response cycles, Svelte components with mocked deps | Vitest + @testing-library/svelte | ~20%                              |
| **E2E**         | Full browser flows (login → join → play) against a running server                                        | Playwright                       | ~5–10 critical journeys, deferred |

E2E testing is appropriate for this project but is deferred until the WebSocket game loop and renderer are non-stub. Writing E2E tests against placeholder implementations produces noise, not signal.

---

## General Principles

### Test isolation

- Unit tests must not depend on external services (database, network, filesystem).
- Server route unit tests use `InMemoryBackend` — a full in-memory `StorageBackend` implementation.
- Integration tests may use real SQLite in-memory (`:memory:`) or a temp directory.
- Each test suite gets a fresh server instance (`buildServer()`) and fresh storage — never share state between suites.

### Determinism

- All tests must be deterministic and reproducible.
- Inject `RngProvider` and `Clock` to control randomness and time in testable code.
- Do not use `Math.random()` or `Date.now()` directly in logic that needs to be tested.
  - **Known exception:** `NotificationState` currently uses both for ID generation. This is acceptable until the notification system becomes a test priority.

### State reset (client singletons)

Client state stores are exported as module-level singletons (`campaignState`, `viewportState`, etc.). Every test file that uses a singleton must reset it in `beforeEach`:

```ts
import { viewportState } from '../state/viewport.svelte';

beforeEach(() => {
  viewportState.reset();
});
```

Failure to reset state between tests causes order-dependent failures that are hard to diagnose.

### Coverage targets

These are floor targets — not goals to game by writing trivial tests:

| Layer                        | Floor |
| ---------------------------- | ----- |
| `domain/` (when implemented) | 80%   |
| `storage/`                   | 80%   |
| `routes/`                    | 60%   |
| Client state stores          | 70%   |
| UI components                | 40%   |

**Coverage priorities:**

1. **Critical paths**: Auth flows, storage CRUD, action resolution (when implemented).
2. **Edge cases**: Invalid inputs, boundary conditions, error handling.
3. **Regression tests**: Add a test for every bug fix.

---

## Tooling Decisions

### Test runner: Vitest (both server and client)

Vitest is configured in both `server/` and `client/` workspaces. It is the single test runner for all unit and integration tests. Both configs are in place and working.

### Client DOM environment: happy-dom

The client vitest config uses `environment: 'happy-dom'`. This is faster than jsdom and sufficient for our use cases. `jsdom` is also installed but unused — prefer `happy-dom`.

### Client component testing: @testing-library/svelte v5

`@testing-library/svelte@^5` supports Svelte 5 runes and is the standard for rendering and querying Svelte components in tests. It requires:

- The package itself in `client/devDependencies`
- `@sveltejs/vite-plugin-svelte` added to `client/vitest.config.ts` so the test runner can transform `.svelte` files

**Status:** Not yet installed — see Phase 0 below.

### Server HTTP testing: Fastify inject()

Server route tests use Fastify's built-in `inject()` method to simulate HTTP requests without opening a real socket. No additional packages needed.

```ts
const response = await server.inject({
  method: 'POST',
  url: '/api/admin/login',
  payload: { password: 'testpassword' },
});
expect(response.statusCode).toBe(200);
```

### E2E: Playwright (deferred)

When implemented, Playwright will be installed at the root workspace level. It is preferred over Cypress because:

- First-class WebSocket interception (critical for the game loop)
- Multi-browser support
- TypeScript-native
- Faster than Cypress for parallelized runs

Cypress WebSocket support requires workarounds and is not appropriate for a WS-heavy application.

---

## Infrastructure Prerequisites (Phase 0)

The following changes must be made before meaningful tests can be written. They are tracked as a prerequisite phase — no test files should target the affected modules until these are in place.

### 1. Injectable `Storage` constructor

**Current state:** `Storage` takes `dataDir: string` and hardcodes `new SqliteStorage({ dataDir })` internally. This makes it impossible to inject a test double.

**Required change:** Refactor `Storage` to accept a `StorageBackend` directly, or add a factory:

```ts
// Option A: accept backend or string
constructor(dataDirOrBackend: string | StorageBackend)

// Option B: separate factory (preferred for clarity)
export function createStorage(backend: StorageBackend): Storage
```

The `StorageBackend` interface is already fully defined in `server/src/storage/storage.ts`.

### 2. InMemoryBackend

Implement `InMemoryBackend implements StorageBackend` using Maps. This is the fast path for route unit tests — no SQLite, no disk, no temp dirs.

Location: `server/src/storage/in-memory-storage.ts`
Export via `server/src/storage/index.ts`

### 3. @testing-library/svelte setup

Add to `client/`:

```bash
npm install --save-dev @testing-library/svelte@^5
```

Update `client/vitest.config.ts` to include the Svelte plugin so component transforms work during test runs.

---

## Implementation Phases

### Phase 0 — Unblock (prerequisite)

- [ ] Refactor `Storage` to accept injectable `StorageBackend`
- [ ] Implement `InMemoryBackend`
- [ ] Install `@testing-library/svelte@^5`
- [ ] Configure Svelte plugin in `client/vitest.config.ts`

### Phase 1 — Unit tests on existing code (parallel agents, after Phase 0)

Each agent targets a different module and produces an independent test file:

**Server agents:**

- Pure functions: `parseTrustProxy`, password hashing, session/CSRF token generation
- Admin auth routes: setup flow, login/logout, CSRF enforcement, rate limiting
- Campaign routes: auth guards, CRUD operations

**Client agents:**

- `parseRoute` (all 6 route types + edge cases)
- `ViewportState` (zoom clamping, pan math, reset)
- `CampaignState` (actor/token accessors, event log)
- `NotificationState` (push, dismiss, ephemeral timeout)

### Phase 2 — Integration tests (after Phase 0)

- Storage: `SqliteStorage` with `:memory:` — full CRUD, sessions, invites, event sequencing
- Server: `buildServer()` with `InMemoryBackend` + full request/response cycles including middleware
- Client: Svelte component tests via `@testing-library/svelte` — form submissions, error states, interactions

Priority components for Phase 2 client tests: `AdminLogin`, `AdminSetup`, `JoinPage`, `ActorPill`.

### Phase 3 — Spec-first for new features

Once Phase 0–2 infrastructure is in place, new features follow this workflow:

1. Write a **spec document** — natural language description of behavior, input/output examples, edge cases, references to relevant types from `docs/shared-types.md`
2. Assign an agent to **translate spec → failing tests**
3. Assign an agent (or same agent) to **implement** until tests pass
4. Run `npm test` + `npm run lint`
5. Repeat

This is the target steady-state for feature development.

### Phase 4 — E2E (deferred)

Deferred until:

- WebSocket game loop sends/receives real game state
- Renderer is non-stub (or stubs are stable enough to test around)
- Auth and join flows are fully wired

When ready:

- Playwright installed at root workspace
- `e2e/` directory at root (outside `client/` and `server/`)
- 5–10 critical journeys only: admin setup, login, campaign create, invite, join game, basic play interaction

---

## Parallelizing Agent-Written Tests

Agents can run in parallel when each targets a different source module. The key contract:

- **Each agent receives a spec document** describing: module path, functions/classes under test, input cases, expected outputs, edge cases, and any required setup (e.g., "populate with 3 actors before testing `getPartyActors`").
- **Each agent produces one test file** that is self-contained — all setup/teardown is inside `describe`/`beforeEach`.
- **No shared server instances** across test files. Each suite creates its own `buildServer()` + fresh `InMemoryBackend`.
- **No shared singleton state** across tests — reset in `beforeEach`.

Agents should not write tests for unimplemented stubs (API methods that throw `NOT_IMPLEMENTED`, no-op renderer calls). Tests for stubs are noise.

---

## Test Contracts

### `InMemoryBackend`

Implements `StorageBackend` using in-memory Maps. Does not persist across instantiations.

```ts
import { InMemoryBackend } from '../storage/in-memory-storage';
import { createStorage } from '../storage/storage';

const storage = createStorage(new InMemoryBackend());
await storage.init();
```

### `MockResolveContext`

_(TBD — when ruleset engine is implemented)_

Mock implementation of `ResolveContext` for testing resolvers in isolation. See [ruleset-engine.md](components/ruleset-engine.md).

### `TestRngProvider`

_(TBD — when RNG-dependent logic is testable)_

Deterministic RNG with seed control. Implements `RngProvider` from [shared-types.md](shared-types.md).

### `TestClock`

_(TBD — when Clock-dependent logic is testable)_

Controllable clock for time-dependent tests. Implements `Clock`.

---

## Shared Package Testing (when `packages/` exists)

When `packages/shared` is added to the workspace:

- Add its own `vitest.config.ts` with `environment: 'node'` — no DOM, no browser APIs
- Tests must be environment-agnostic (no `window`, `document`, `fs`, Fastify types)
- Add to root `package.json` workspaces so `npm test` includes it automatically

---

## Running Tests

```bash
# Run all tests across all workspaces
npm test

# Run tests with coverage
npm run test:coverage

# Run server tests only
npm test --workspace=server

# Run client tests only
npm test --workspace=client

# Watch mode (single workspace)
cd server && npm run test:watch
cd client && npm run test:watch
```
