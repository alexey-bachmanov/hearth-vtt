# 003: Use Fastify for the Node.js Server Framework

## Status

Accepted

## Context

The HearthVTT Game Server must:

- serve the client bundle (static assets)
- expose HTTP endpoints (health, import/export, auth, admin actions)
- provide WebSocket Secure (WSS) realtime transport (actions, prompts, state deltas)
- validate inputs rigorously at the boundary (avoid bad state)
- remain maintainable as features grow (plugins/modules)

The project prioritizes performance, clean boundaries, and schema-first validation.

## Decision

Use **Fastify** as the Node.js HTTP framework for the Game Server. Implement WebSocket Secure (WSS) handling in the server with clear separation:

- delivery layer: `routes/`, `ws/`
- application layer: `services/`
- domain layer: `domain/`
- persistence: `storage/` via Storage class facade

Use schema validation at boundaries (requests/messages) to pass trusted, typed data inward.

**Note:** WebSocket connections must use WSS (WebSocket Secure) in production. TLS termination can be handled via reverse proxy (recommended) or native TLS support in Fastify.

## Alternatives considered

1. **Express**
   - Pros: very familiar, huge middleware ecosystem
   - Cons: validation and structure are more “bring your own”; easier for codebases to drift into ad-hoc patterns; less schema-first by default

2. **Koa / Hapi / other frameworks**
   - Pros: viable alternatives
   - Cons: Fastify provides strong performance and a plugin + schema-first mindset aligned with project goals

## Consequences

- Boundary validation becomes standard practice, reducing brittle “stringly typed” logic.
- Plugin-based structure supports modular server growth.
- Routes remain thin; services remain framework-agnostic.
