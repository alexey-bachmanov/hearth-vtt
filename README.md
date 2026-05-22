# HearthVTT

> A homebrew-first, system-agnostic, self-hostable virtual tabletop.

HearthVTT is a virtual tabletop for tabletop RPGs that you own and run yourself. It is designed to be fast on the map, friendly to homebrew content, and free of lock-in to any particular rules system or hosting provider.

**Status:** Pre-alpha. The architecture and core systems are being built. It is not yet usable for running a real campaign — follow along, file issues, or help build it.

---

## Why

The existing VTT landscape tends to push you in one of a few directions: rent your campaign from someone else's cloud, glue several tools together with plugins, do meaningful amounts of TTRPG math by hand during play, or pay a lot for features you don't want while still missing the ones you do.

HearthVTT is an attempt at a different set of trade-offs:

- **You host it.** Your campaign data lives on your machine (or your server). Export and walk away whenever you want.
- **Homebrew is a first-class citizen.** Compendiums are writable. Custom content is the default workflow, not an afterthought.
- **The rules system is data, not the engine.** The same server can run a crunchy d20 system, a narrative PbtA hack, or something you made up last weekend.
- **The map should feel good.** WebGL rendering, per-user vision, and a renderer kept separate from UI framework concerns.

---

## What it does (and will do)

Implemented or in active development:

- Authoritative game server (Fastify + WebSocket) that serves its own web client
- SQLite-backed persistence with portable campaign packages
- Admin UI for campaign, seat, and invite management
- Invite-link join flow with PIN-protected, revocable sessions
- Reactive client state, play UI scaffolding, and renderer integration points

Planned (see [docs/todo.md](docs/todo.md) and [docs/implementation-strategy.md](docs/implementation-strategy.md)):

- WebGL via PixiJS map renderer with per-user visibility masks and dynamic lighting
- Ruleset engine: data-defined schemas, actions, UI templates, and a constrained DSL for action resolution
- Portable `.campaign`, `.tome`, `.ruleset`, and `.character` file formats
- Effects as first-class entities (modifiers and durations)
- Optional relay/tunneling for remote play without port forwarding

---

## Architecture at a glance

HearthVTT is a TypeScript monorepo with strict layering. The short version:

- **`server/`** — Fastify HTTP + WebSocket, SQLite storage, auth, and the static client bundle. The server is the single source of truth for campaign state.
- **`client/`** — Svelte 5 web UI, reactive state stores, and the PixiJS renderer. UI dispatches actions; the server resolves them.
- **`packages/`** — Shared protocol types and pure utilities usable by both sides.
- **`docs/`** — Design documents and ADRs. These are the source of truth when code and docs disagree.

Dependencies point inward: delivery layers (routes, WS handlers, Svelte components) depend on services and domain logic, never the other way around. Framework types (Fastify, Svelte) are not allowed to leak into domain or service code. The full boundary rules live in [`.github/copilot-instructions.md`](.github/copilot-instructions.md) and are enforced by convention and review.

For the full picture, start with:

- [docs/architecture-overview.md](docs/architecture-overview.md) — system map and core principles
- [docs/shared-types.md](docs/shared-types.md) — canonical terminology (Seat, Session, CampaignState, Ruleset, etc.)
- [docs/components/](docs/components/) — per-component design (server, client, data model, ruleset engine)
- [docs/protocols/](docs/protocols/) — HTTP API and realtime WS protocol
- [docs/decisions/](docs/decisions/) — architectural decision records

---

## Getting started

### Requirements

- **Node.js 24+** (see `engines` in [package.json](package.json))
- **npm** (workspaces are used; no other package manager is configured)

### Install and run

```bash
git clone https://github.com/alexey-bachmanov/hearth-vtt.git
cd hearth-vtt
npm install

# Run server and client together in dev mode
npm run dev:all
```

Useful scripts from the repo root:

| Script                  | What it does                                    |
| ----------------------- | ----------------------------------------------- |
| `npm run dev:all`       | Runs server and client dev servers concurrently |
| `npm run dev:server`    | Server only (with reload)                       |
| `npm run dev:client`    | Client only (Vite dev server)                   |
| `npm run build`         | Builds client, then server                      |
| `npm run start`         | Runs the built server (serves the built client) |
| `npm test`              | Runs tests in all workspaces that define them   |
| `npm run test:coverage` | Same, with coverage                             |
| `npm run lint`          | Lints all workspaces                            |
| `npm run clean`         | Removes build artifacts                         |

### First-time admin setup

On first start the server generates a one-time setup PIN and writes it to the console and to `admin-setup-pin.txt`. Visit `/admin/setup`, enter the PIN, and set an admin password. After that, manage campaigns, seats, and invites from `/admin`. Players join via `/join/<inviteToken>` and end up at `/play`. See [docs/components/auth-join-flow.md](docs/components/auth-join-flow.md) for details.

---

## Repository layout

```
server/      Fastify + WS + SQLite. Authoritative game server. Serves the client bundle.
client/      Svelte 5 web UI, reactive stores, PixiJS renderer.
packages/    Shared protocol types and pure utilities.
docs/        Design docs, ADRs, protocol specs, component docs.
scripts/     Build helpers (Docker image, single-file executable, clean).
```

Each workspace has its own `package.json`, `tsconfig.json`, ESLint config, and test setup.

---

## Testing

Tests live next to the code they cover (`*.test.ts`) and run with Vitest in both workspaces. See [docs/testing.md](docs/testing.md) for conventions, including which layers are unit-tested vs. integration-tested and how the realtime protocol is exercised.

```bash
npm test                 # all workspaces
npm run test --workspace=server
npm run test --workspace=client
```

---

## Contributing

Contributions are welcome, with one ask: **open or comment on an issue before starting non-trivial work**. The project is moving fast and the architectural boundaries described above are deliberate — a quick conversation up front saves rework later.

Before you start:

1. Read [`.github/copilot-instructions.md`](.github/copilot-instructions.md). It applies to humans too; it is the most concise guide to the project's rules.
2. Skim the relevant doc(s) under [docs/components/](docs/components/) and any related ADR in [docs/decisions/](docs/decisions/).
3. For changes that affect protocols or cross architectural boundaries, expect to add or update an ADR.

Workflow conventions:

- Branches: `{type}/{issue-number}-{kebab-description}` (e.g. `fix/12-server-lint-errors`)
- PR titles reference the issue and target `main` (e.g. `Fix #12: server lint errors`)
- A change is "done" when it builds, tests pass, lint passes, and docs reflect any behavior or architecture changes

Good first issues will be labeled in the issue tracker as the project stabilizes. In the meantime, bug reports, doc improvements, and questions are all useful.

---

## Legal Stuff

### License

### Trademarks

### Contributions

---

## Acknowledgements

HearthVTT exists because of the people who have built and shared VTTs, rules systems, and homebrew content before it — and because of the GMs and players who've been frustrated enough to want something different. Thanks for being here.
