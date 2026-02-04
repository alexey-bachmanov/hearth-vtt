# Milestone 1 checklist: placeholder server

- Fastify server starts with env config
- Creates `DATA_DIR` and subfolders if missing
- Initializes SQLite via storage interface (even if tables are minimal)
- `GET /healthz` works
- `GET /` serves placeholder page or `client/dist`
- WS endpoint `/ws` supports hello/welcome + ping/pong
- Dockerfile runs the same server
- README/dev scripts (optional) for local + docker run

---

# Architecture and Planning

## Documentation status

- [x] shared-types.md — canonical type definitions and terminology glossary
- [x] ruleset-engine.md — engine contracts, DSL overview, failure handling
- [x] server.md — storage interface, Prompt/Workflow persistence
- [x] client.md — UI layout, component hierarchy, renderer API
- [x] realtime-ws.md — WebSocket protocol specification
- [x] data-model.md — file formats, storage architecture, entity schemas
- [x] domain-specific-language.md — DSL grammar, expression language, operations reference
- [x] testing.md — testing guidelines

## Stub types to define (see shared-types.md)

- [ ] Define shape for `RollModifier` — modifiers applied to dice rolls from effects
- [ ] Define shape for `StatModifier` — modifiers applied to derived stats from effects
- [ ] Define shape for `SyncBundle` — initial state bundle sent to clients on connect
- [ ] Define shape for `RealtimeHub` — interface for broadcasting to connected clients
- [ ] Define shape for `Logger` — structured logging interface

## Tome/Ruleset integration

- [ ] Define template lookup API — how Tome entries reference Ruleset resolver templates
- [ ] Define Compendium loading — how Tomes are indexed at session start

---

# Future milestones (not required yet)

- Auth: invite claim → refresh cookie → access token; revocation tooling
- Campaign import/export:
  - `.campaign` zip unpack into working dir + SQLite + assets
  - export packages SQLite + assets into `.campaign`
- Action engine + ruleset loading
- State delta broadcasting and prompt delivery
- Hosted mode configuration (TRUST_PROXY, PUBLIC_BASE_URL, persistent volumes)

---
