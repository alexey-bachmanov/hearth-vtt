# Contributing to HearthVTT

Thanks for your interest in HearthVTT. This document covers the legal side of contributing. For the technical side — architecture rules, branch naming, and "what counts as done" — start with [`.github/copilot-instructions.md`](.github/copilot-instructions.md) and the [README](README.md#contributing).

---

## License of contributions

HearthVTT is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`). The full text is in [LICENSE](LICENSE).

By contributing, you agree that your contribution will be distributed under the same license. If you submit code that is partly derived from another open-source project, that project's license must be compatible with AGPL-3.0-or-later, and you must say so in your commit (and keep any required notices intact).

We do **not** use a Contributor License Agreement (CLA). We use the **Developer Certificate of Origin (DCO)** instead — see below.

---

## Sign your commits (DCO)

Every commit you contribute must include a `Signed-off-by` line. This is a lightweight way of asserting that you wrote the code (or otherwise have the right to contribute it) and that you're okay with it being distributed under this project's license.

In practical terms:

```bash
git commit -s -m "Fix #42: stop the dice roller from rolling d0"
```

The `-s` flag appends a trailer like this to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name (or a long-standing pseudonym you can be reached by) and a real email. The values come from `git config user.name` and `git config user.email`.

### What you're certifying

Adding `Signed-off-by` means you agree to the [Developer Certificate of Origin 1.1](DCO.md). The short version:

- **(a)** You wrote the contribution yourself and you have the right to submit it under the project's license, **or**
- **(b)** Your contribution is based on prior work that is under a compatible open-source license, and you have the right to submit a modified version under the same license, **or**
- **(c)** Someone else gave you the contribution and they certified (a), (b), or (c), and you haven't modified it.
- **(d)** You understand the contribution is public and will be kept (with your sign-off) indefinitely.

The full, authoritative text is in [DCO.md](DCO.md). If anything in this summary disagrees with [DCO.md](DCO.md) or [developercertificate.org](https://developercertificate.org/), the original DCO wins.

### Forgot to sign off?

Fix the most recent commit:

```bash
git commit --amend -s --no-edit
```

For a series of commits, rebase and sign them:

```bash
git rebase --signoff main
```

PRs without sign-offs will be asked to add them before merge.

---

## Why DCO and not a CLA?

A CLA (Contributor License Agreement) typically transfers rights to a project owner, often so the owner can later relicense the project (for example, to offer it under a non-free license as well). HearthVTT is intentionally not built that way: the project must stay community-owned and copyleft.

The DCO is lower friction (no forms, no accounts) and matches the project's posture. It does mean that **HearthVTT can never be relicensed away from AGPL-3.0-or-later** without contacting every contributor — which is a feature, not a bug.

If the project ever grows to a point where a CLA or formal contributor management is warranted, that change would happen via an ADR in [`docs/decisions/`](docs/decisions/) and a public discussion before any policy change. It is not a near-term plan.

---

## Trademarks

The HearthVTT name, logo, and visual identity are **not** covered by the AGPL — they're trademarks of the project. Forking the code is welcome (that's the whole point of the license); forking the name is not. See [TRADEMARKS.md](TRADEMARKS.md) for the short version.

---

## Local development

### First-time setup

1. Install dependencies: `npm install`
2. Seed the dev database: `npm run dev:seed-dev-db`
   - Creates `campaign-mock-001` with a `dev` player account bound to the GM seat.
   - Set `HEARTH_DEV_ADMIN_PASSWORD` in your environment for a fixed password, or copy the randomly generated one from the terminal output.
3. Start all services: `npm run dev:all`
4. Open `http://localhost:5173/admin/setup` to create the server admin account (the server will print a setup PIN on startup).
5. Log in at `http://localhost:5173/play/login` as `dev` to enter the pre-seeded campaign.

### Re-seeding

If you want to wipe the game database and start fresh:

```bash
rm server/data/db/hearth.db   # or: del server\data\db\hearth.db on Windows
npm run seed-dev-db
```

### Resetting admin setup

To re-run the first-time admin setup without affecting player accounts or game data:

```bash
npm run dev:reset-setup
```

Restart the server — it will print a new setup PIN and redirect to `/admin/setup`.

---

## How to contribute

1. Open or comment on an issue describing what you want to do, before starting non-trivial work.
2. Branch off `main` using `{type}/{issue-number}-{kebab-description}` (for example, `fix/12-server-lint-errors`).
3. Read [`.github/copilot-instructions.md`](.github/copilot-instructions.md) and any relevant docs in [`docs/components/`](docs/components/) or [`docs/decisions/`](docs/decisions/) before changing architecture-adjacent code.
4. Make your change in small, verifiable steps. Tests and lint should pass; docs should reflect any behavior or architecture change.
5. Commit with `git commit -s`.
6. Open a PR titled like `Fix #12: server lint errors` with `Closes #12` in the body.

That's it. Welcome aboard.
