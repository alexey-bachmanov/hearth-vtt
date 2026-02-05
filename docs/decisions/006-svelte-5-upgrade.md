# 006: Upgrade to Svelte 5

## Status

Accepted

## Context

HearthVTT's frontend was initially prototyped with Svelte 4.2.8. As we prepare to build the production client architecture, we have the opportunity to upgrade to Svelte 5 before implementing the core UI components.

Svelte 5 was released in October 2024 and has been stable for over a year. It introduces a new reactivity system based on **runes** (`$state`, `$derived`, `$effect`) that replaces the store-based patterns of Svelte 4. Key changes include:

- **Runes-based reactivity**: More explicit, composable, and performant than Svelte 4's implicit reactivity
- **Snippet syntax**: Improved component composition and slot patterns
- **Better TypeScript support**: Stronger type inference for component props and events
- **Performance improvements**: Faster runtime with smaller bundle sizes
- **Modern API patterns**: Clearer ownership semantics and reduced "magic"

The current codebase has only a single "hello world" `App.svelte` component that will be completely scrapped during the architectural rebuild. This provides a perfect migration window with minimal friction.

## Decision

Upgrade to **Svelte 5** (^5.1.9) before implementing the production client architecture.

Package updates:
- `svelte`: ^4.2.8 → ^5.1.9
- `@sveltejs/vite-plugin-svelte`: ^3.0.1 → ^5.0.1
- `svelte-check`: ^3.6.2 → ^4.0.8
- `typescript`: ^5.3.3 → ^5.6.3
- `vite`: ^5.0.10 → ^6.0.1

## Rationale

1. **Greenfield rewrite**: The existing `App.svelte` is a prototype that will be completely replaced. There is no migration burden.

2. **Long-term ecosystem direction**: Svelte 5+ is the current API direction. Starting with Svelte 4 would require migration later.

3. **Better reactivity model**: Runes provide explicit, composable state management that aligns well with HearthVTT's requirements:
   - Shared state (`$state` in classes/modules)
   - Derived computations (`$derived` for computed campaign state)
   - Side effects (`$effect` for WebSocket sync, renderer updates)

4. **Improved performance**: Svelte 5's runtime is faster and generates smaller bundles—important for the WebGL-heavy client.

5. **Maturity**: By February 2026, Svelte 5 has been stable for 15+ months with proven production usage.

## Alternatives considered

1. **Stay on Svelte 4**
   - Pros: No breaking changes, familiar store patterns, established ecosystem
   - Cons: Would require migration later; misses performance and DX improvements; not the framework's future direction
   - Rejected: Migration burden is minimal now, maximal later

2. **Wait for Svelte 6**
   - Pros: Future-proof against next major version
   - Cons: Unknown timeline (likely 2027+); would delay development; Svelte 5 is current stable
   - Rejected: Speculative; Svelte 5 is mature and stable

3. **Switch to React/Vue/other**
   - Pros: Larger ecosystems, more third-party libraries
   - Cons: Heavier runtime; less suitable for WebGL-heavy app; undermines existing architectural decisions
   - Rejected: Out of scope; Svelte's compile-time approach and performance profile align well with HearthVTT's needs

## Consequences

### Positive

- All new components use modern Svelte 5 patterns (runes, snippets)
- Better performance baseline for the WebGL-heavy client
- Explicit state management patterns make data flow clearer
- Improved TypeScript integration reduces type errors
- Future-proof against framework deprecations

### Negative

- Team must learn Svelte 5 patterns (minimal cost for small team)
- Some third-party libraries may not yet support Svelte 5 (rare; ecosystem has adapted)
- Documentation and tutorials online may reference Svelte 4 patterns (manageable)

### Migration notes

Since the existing `App.svelte` will be scrapped:
- No store-to-rune migration needed for existing code
- State management will be designed from scratch using `$state` in modules
- Component hierarchy will use Svelte 5 patterns natively

---

Related ADRs:
- [001: WebGL Rendering](001-webgl-rendering.md) — Svelte 5's performance improvements benefit WebGL coordination
