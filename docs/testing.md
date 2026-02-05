# Testing — HearthVTT (`docs/testing.md`)

This document defines testing guidelines, contracts, and strategies for HearthVTT components.

---

## General Principles

### Test isolation

- Unit tests should not depend on external services (database, network, filesystem).
- Use in-memory implementations of storage and other interfaces for unit tests.
- Integration tests may use real SQLite (in-memory or temp file).

### Determinism

- All tests must be deterministic and reproducible.
- Inject `RngProvider` and `Clock` to control randomness and time.
- Never use `Math.random()` or `Date.now()` directly in testable code.

### Coverage priorities

1. **Critical paths first**: Action resolution, patch application, audience filtering.
2. **Edge cases**: Invalid inputs, boundary conditions, error handling.
3. **Regression tests**: Add a test for every bug fix.

---

## Testing Strategies by Component

### Storage Layer

- Use in-memory SQLite (`:memory:`) for fast tests.
- Test transaction rollback behavior explicitly.
- Test event sequencing guarantees (monotonic sequence numbers).

### Ruleset Engine

- Test DSL operations in isolation with mock `ResolveContext`.
- Test full action resolution with in-memory state views.
- Verify failure handling (resolver errors, invalid patches, recursion limits).

### Server/API

- Use Fastify's `inject()` for HTTP route testing without network.
- Test WebSocket Secure (WSS) handshake and message validation.
- Test both secure (WSS) and local development (WS) connection modes.
- Test authentication/authorization flows once implemented.

### Client (future)

- Unit test state management and derived computations.
- Integration test with mock server responses.
- Visual regression testing for renderer (optional, later).

---

## Test Contracts (TBD)

Specific testing contracts for components will be added here as they are implemented:

- `MockResolveContext` — Mock implementation of `ResolveContext` for testing resolvers (see [ruleset-engine.md](components/ruleset-engine.md))
- `MockStorage` — In-memory storage implementation for testing (see [server.md](components/server.md) Storage interface)
- `TestRngProvider` — Deterministic RNG with seed control (implements `RngProvider` from [shared-types.md](shared-types.md) stubs)
- `TestClock` — Controllable clock for time-dependent tests (implements `Clock`)

---

## Running Tests

(To be updated with actual commands once test infrastructure is in place.)

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific component tests
npm test -- --filter=storage
npm test -- --filter=ruleset
```
