# 001: Use WebGL for Map Rendering

## Status

Accepted

## Context

HearthVTT needs smooth, responsive map play with:

- large maps and zoom/pan
- many tokens
- fog-of-war and “explored vs currently visible”
- dynamic lighting and composited visibility masks

A major pain point in existing VTTs is sluggishness caused by excessive main-thread work and expensive compositing.

## Decision

Use **WebGL** as the primary rendering backend for the map scene (map, tokens, fog, lighting). Use DOM/UI framework only for “chrome” (sheets, chat, toolbars).

Visibility is computed via **CPU visibility polygons (worker-friendly)** and **GPU mask compositing**. The implementation is hidden behind a stable interface (e.g., `updateVisibility()`), allowing future algorithm improvements without API breakage.

## Alternatives considered

1. **Canvas 2D**
   - Pros: simpler implementation, easier debugging
   - Cons: large-scale mask compositing and lighting effects can become expensive; performance cliffs on big maps and frequent updates

2. **Full GPU raymarching / shader-based LoS**
   - Pros: conceptually “all on GPU”
   - Cons: substantially higher complexity; performance and correctness pitfalls; not necessary for v1

## Consequences

- Map rendering and fog/lighting compositing are handled by GPU-friendly pipelines.
- CPU-side work focuses on geometric visibility polygon computation and is designed to run off the main thread.
- The codebase needs a clear separation between UI framework and renderer subsystem.
