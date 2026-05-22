# 008: Licensing, Contributions, and Trademarks

## Status

Accepted

## Context

HearthVTT is reaching the point where source code, design docs, and contribution channels exist in public. Before contributions arrive — and before any future hosted offering exists — the project needs an explicit legal posture covering three related questions:

1. **Under what license is the software distributed?**
2. **Under what terms do contributors submit code?**
3. **Who controls the project's name and identity?**

Each of these decisions interacts with the others. They also interact with two longer-term goals:

- **Self-hostable, always.** The core server must remain runnable by anyone, on their own hardware, without a platform account or external service.
- **A separate, optional SaaS convenience layer.** A future hosted offering may exist, but it must not require modifications to the core server, must talk to it only over the same public APIs that any other client uses, and must never be a precondition to running HearthVTT.

The decisions below are chosen to make those goals durable — including against future versions of the maintainers.

### Constraints

- The project is intended to remain **community-owned** and **copyleft**.
- The project must be **AGPL-compatible specifically**, because the server is a network service and the policy intent is that modified network deployments must share their changes.
- Contribution overhead must be low; a CLA would be a barrier and would also create a power asymmetry that contradicts the community-ownership goal.
- The project's **identity** (name, logo, branding) needs basic protection, but that protection must not undermine the AGPL's freedoms or the right to fork the code.

## Decision

HearthVTT adopts the following legal posture:

### 1. License: `AGPL-3.0-or-later`

The HearthVTT source code, documentation, and design assets are licensed under the **GNU Affero General Public License, version 3 or later**.

- The full license text is checked into the repository as `LICENSE` (no extension, so platforms auto-detect it).
- `SPDX-License-Identifier: AGPL-3.0-or-later` is the canonical identifier.
- The identifier is added to top-level project metadata (README, root and workspace `package.json` files) immediately. Adding per-file SPDX headers is tracked as tech debt rather than blocking this ADR.
- `-or-later` is used (not bare `AGPL-3.0`) to give the project the option of moving to a future FSF-published AGPL version without re-licensing.

### 2. Contributor sign-off: DCO 1.1 (no CLA)

Contributions are accepted under the **Developer Certificate of Origin, version 1.1**.

- The full DCO text is checked into the repository as `DCO.md`.
- Every commit must include a `Signed-off-by:` trailer (`git commit -s`). Enforcement (e.g., the GitHub DCO app) will be enabled when the project starts accepting outside contributions.
- A human-readable explanation lives in `CONTRIBUTING.md`.
- **No CLA is required.** The project does not collect, and will not collect, rights assignments from contributors. This means HearthVTT cannot be relicensed away from `AGPL-3.0-or-later` without contacting every contributor — which is the intended outcome.

### 3. Trademarks: name and identity reserved, code is not

The **HearthVTT name, logo, and visual identity** are treated as trademarks of the project. The **code** is not.

- A short, plain-language trademark policy lives in `TRADEMARKS.md`.
- The policy explicitly states that the trademark restrictions do not limit any of the rights granted by the AGPL — forks of the code are welcome, but they need a different name and visual identity.
- Formal registration is **not** pursued at this stage; the policy is a statement of intent that can grow into something more formal if and when it matters.

### 4. Boundary between core and any future hosted offering

This ADR also locks in the relationship between the core HearthVTT project and any future hosted/platform offering:

- The core server has **no** code paths that exist solely to support a SaaS offering. There is no "platform mode," no SaaS-only flags, no hidden APIs reserved for a hosted provider.
- Any future hosted offering communicates with HearthVTT servers **only** through the same public HTTP and WebSocket APIs that any other client or operator may use.
- HearthVTT will always be fully usable without any hosted offering. The hosted offering, if it exists, is a convenience layer (hosting Docker images, marketplace for content, discovery) and is structurally optional.
- If a third party builds a competing platform on top of the same APIs, that is a fair use of the project, by design.

## Alternatives considered

### License alternatives

- **MIT / Apache 2.0** — Maximally permissive. Rejected because a permissive license allows a single operator to take HearthVTT proprietary as a network service and never share improvements back. This is the exact failure mode AGPL was designed to prevent, and the one most relevant to a VTT.
- **GPL-3.0** — Copyleft, but does not require source disclosure for network-only use. Rejected: HearthVTT is fundamentally a network service, so the GPL's distribution trigger rarely fires in practice. AGPL closes that loop.
- **Server Side Public License (SSPL) / Business Source License (BSL) / Elastic License** — "Source-available" licenses designed to prevent hosted competition. Rejected: they are not OSI-approved open source, they conflict with the community-ownership posture, and they exist primarily to benefit a single commercial vendor — exactly the dynamic this project is trying to avoid.
- **AGPL-3.0 (no `-or-later`)** — Considered. Rejected because `-or-later` gives the project a forward path without requiring a relicensing event.

### Contribution alternatives

- **CLA (e.g., Apache ICLA, Fiduciary License Agreement, custom)** — Rejected for now. A CLA would let the project relicense in the future, which sounds useful but is precisely the power we want to deny to future maintainers (including future versions of the current maintainer). The asymmetry CLAs create also discourages casual contributors.
- **No sign-off requirement** — Rejected. The DCO is essentially free to adopt, provides a clean provenance trail, and is the de facto standard for projects that decline to use a CLA.

### Trademark alternatives

- **No trademark policy** — Rejected. Without any stated policy, a hostile actor could publish a misleading fork or service under the project's name and we'd have weak ground to push back.
- **Formal trademark registration** — Deferred. Registration costs money, varies by jurisdiction, and isn't justified at the project's current scale. The plain-language policy in `TRADEMARKS.md` sets expectations now; registration can follow if it becomes warranted.
- **Trademark restrictions on the code itself** — Rejected. This would conflict with the AGPL and would undermine the right to fork. The policy is deliberately scoped to _identity_, not technology.

## Consequences

### Intended consequences

- The core server stays free (as in freedom) and self-hostable, in perpetuity, by design.
- Any modified hosted version of HearthVTT must publish its source to its users (AGPL §13). This applies to us too: a future hosted offering built on top of a modified core would have to be open. The cleanest way to avoid that obligation — and the path this project chooses — is to keep the core unmodified and treat any platform layer as a separate AGPL service that talks to the core over public APIs.
- The project cannot be quietly relicensed or taken proprietary, because relicensing would require consent from every contributor.
- Contributors retain copyright in their contributions. The project as a whole is the union of individual copyrights, all licensed under AGPL-3.0-or-later.

### Costs and tradeoffs

- **AGPL deters some adopters.** Some companies refuse to use AGPL code, particularly for internal infrastructure. This is accepted as a deliberate cost of the license's protections.
- **Relicensing is effectively permanent.** This is intentional, but it does mean we must be confident in the AGPL choice now.
- **No CLA means no easy relicensing.** Same as above; this is the desired property.
- **Per-file SPDX headers are not yet present.** Tracked as tech debt. The repo-level `LICENSE` file and metadata-level `SPDX-License-Identifier` cover the legal baseline.
- **Trademark enforcement is best-effort.** Without registration, defense is limited to common-law trademark rights in jurisdictions that recognize them. Acceptable at current scale.
- **The DCO is not retroactive.** Commits made before this policy was adopted do not carry `Signed-off-by` trailers. Going forward, all new contributions must sign off; existing history is treated as authored by the original committer under the same license.

## References

- [`LICENSE`](../../LICENSE) — full AGPL-3.0 text
- [`DCO.md`](../../DCO.md) — full Developer Certificate of Origin 1.1 text
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — contributor-facing summary
- [`TRADEMARKS.md`](../../TRADEMARKS.md) — trademark policy
- [GNU AGPL FAQ](https://www.gnu.org/licenses/gpl-faq.html)
- [developercertificate.org](https://developercertificate.org/)
