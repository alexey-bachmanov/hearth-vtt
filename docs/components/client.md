# Client Component — HearthVTT (`docs/components/client.md`)

This document defines the **Web Client** architecture, UI layout, component hierarchy, and interface contracts.

> **Terminology:** See [shared-types.md](../shared-types.md) for canonical definitions of GameEvent, Action, Prompt, Audience, and other shared types.

---

## Goals

### Fast, responsive map interaction

- WebGL rendering for map, tokens, fog, lighting, and effects
- Smooth token dragging with client-side collision detection
- Live token movement broadcast to other seats (throttled to ~15-20 updates/sec)

### Clear separation of concerns

- UI framework (Svelte) handles DOM chrome only
- Renderer exposes a stable public API
- Business logic lives in `domain/` and `app/` layers, not in components

### Ruleset-driven UI

- Toolbar visibility controlled by Ruleset (e.g., no dice roller if game doesn't use dice)
- Action buttons and character sheet layouts defined by Ruleset templates
- Manual fallbacks available if Ruleset specifies them

### Accessible and touch-friendly

- DOM UI follows ARIA guidelines for screen readers
- Consider colorblind-friendly token indicators
- Touch input support for tablet users (implementation details TBD)

---

## Authentication and Join Flow

HearthVTT uses a **capability-based join link** system with **cookie-based sessions** for authentication.

### User Journey

1. **Join Link**: User receives a link from admin: `GET /join/<inviteToken>`
2. **Claim Page**: Client renders claim UI, prompts for PIN
3. **Claim Request**: `POST /api/auth/claim-invite` with invite token + PIN
4. **Session Creation**: Server validates, sets HttpOnly cookies (refresh token), returns session data
5. **Redirect to Play**: Client redirects to `/play` (clean URL, no secrets)
6. **Authenticated State**: All API calls and WebSocket connections use cookie session

### Client Responsibilities

- **Join/Claim UI**: Render invite claim page with PIN input
- **Cookie Management**: Browser handles cookies automatically (HttpOnly, Secure, SameSite=Lax)
- **Clean URLs**: Never bookmark join links; `/play` is the stable, bookmarkable URL
- **Session Refresh**: Call `POST /api/auth/refresh` to rotate refresh token and get new access token
- **Logout**: Call `POST /api/auth/logout` to revoke session
- **Admin UI**: Separate interface for admin seat holders (campaign management, invite creation, seat management)
- **Not Logged In**: If `/play` accessed without valid session, show "Not logged in" with instructions

### Admin UI vs Play UI

The client must support **two distinct interfaces**:

- **Play UI** (default): Main game interface with map, chat, character sheets, etc.
  - Used by GM, player, and spectator seats
  - Accessed via `/play` after authentication

- **Admin UI**: Campaign management interface
  - Used only by admin seat holders
  - No map/gameplay layer; focuses on:
    - Campaign import/export
    - Ruleset and Tome management
    - Seat creation and permission management
    - Invite creation and revocation
    - Session audit and active connection management
  - Route: `/admin` (or similar; not yet finalized)

See [auth-join-flow.md](auth-join-flow.md) and [ADR 005](../decisions/005-networking-management.md) for complete specification.

---

## UI Layout

The client UI is divided into distinct zones. All coordinates assume a standard landscape desktop viewport.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SnackbarArea (Prompts)                          │
├───────────────┬─────────────────────────────────────────┬───────────────┤
│               │                                         │               │
│   LeftSidebar │           MainCanvas (WebGL)            │  RightSidebar │
│   (GM only)   │                                         │               │
│               │                                         │               │
│               │                                         │               │
│               │                                         │               │
│               │                                         │               │
├───────────────┴─────────────────────────────────────────┴───────────────┤
│                           BottomToolbar                                 │
└─────────────────────────────────────────────────────────────────────────┘
                    ┌─────────────────────────────────────┐
                    │   FloatingWindowLayer               │
                    │   (character sheets, etc.)          │
                    └─────────────────────────────────────┘
```

### Zone Descriptions

| Zone                    | Visibility                      | Purpose                                                           |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------- |
| **SnackbarArea**        | All seats                       | Prompts, notifications, concentration indicators, targeting UI    |
| **LeftSidebar**         | GM only                         | Scene navigator, wall/light editors, actor library                |
| **MainCanvas**          | All seats                       | WebGL-rendered map, tokens, fog, lighting, effects                |
| **RightSidebar**        | All seats                       | Chat log, drawers (Compendium, Journal, Settings)                 |
| **BottomToolbar**       | All seats (filtered by Ruleset) | Dice roller, drawing tools, measurement, ping, initiative tracker |
| **FloatingWindowLayer** | All seats                       | Draggable windows for sheets, documents, inspectors               |

---

## Component Hierarchy

```
App
├── SnackbarArea
│   ├── PromptSnackbar (targeting, reactions, choices)
│   ├── ConcentrationIndicator (persistent spell tracking)
│   └── NotificationToast (ephemeral messages)
│
├── MainCanvas (WebGL container)
│   ├── MapLayer (static image or animated video)
│   ├── GridLayer (square, hex, or none)
│   ├── ObstructionLayer (walls — visible to GM, used for collision)
│   ├── FogLayer (explored vs unexplored visibility mask)
│   ├── TokenLayer (actors with live drag previews)
│   ├── EffectLayer (persistent AoEs, auras)
│   ├── AnnotationLayer (drawings, text, measurement previews)
│   ├── LightingLayer (dynamic lights composited)
│   ├── TargetingOverlay (reticle for target selection, AoE placement)
│   └── VFXLayer (transient visual effects from action resolution)
│
├── LeftSidebar (GM only)
│   ├── SceneNavigator (map directory tree, player movement controls)
│   ├── WallEditor (draw/edit walls, windows, doors)
│   ├── LightEditor (place/configure light sources)
│   ├── ActorLibrary (campaign monsters, NPCs — drag to map)
│   └── [Extensible for future GM tools]
│
├── RightSidebar
│   ├── ChatLog
│   │   ├── GameEventCard (roll results, damage, chat messages)
│   │   └── RichEmbed (interactive spell/item cards)
│   └── DrawerTabs
│       ├── CompendiumDrawer (search all, browse by Tome)
│       ├── JournalDrawer (handouts, notes)
│       ├── SettingsDrawer (UI preferences, audio controls)
│       └── JukeboxDrawer (stub — audio/ambient sound, TBD)
│
├── BottomToolbar (visibility controlled by Ruleset)
│   ├── DiceRoller (manual rolls — hidden if Ruleset excludes dice)
│   ├── InitiativeTracker (button opens modal — hidden if Ruleset excludes initiative)
│   ├── DrawingTools (shapes, freehand, text on map)
│   ├── MeasurementTool (point-to-point, path, square, circle, cone; public/private toggle)
│   ├── PingTool (ephemeral map annotations)
│   └── [Extensible for Ruleset-defined tools]
│
└── FloatingWindowLayer (z-index: most-recently-clicked on top)
    ├── CharacterSheet (per-actor, draggable, future: pop-out to separate window)
    ├── DocumentReader (handouts, rulebook excerpts)
    ├── ItemInspector (item details)
    ├── InitiativeModal (sorted turn order, current turn highlighted)
    └── [Dynamic based on user interaction]
```

---

## Snackbar / Prompt System

Prompts from the server (see [shared-types.md](../shared-types.md) `Prompt` type) are rendered as snackbars along the top of the window.

### Prompt Kinds

| Kind        | Rendering                     | Behavior                                                     |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `ephemeral` | Toast notification            | Auto-dismisses after timeout                                 |
| `blocking`  | Snackbar with actions         | Requires user interaction; may show targeting reticle on map |
| `inline`    | Embedded in another component | Rendered within character sheet or chat card                 |

### Targeting Flow Example

1. Player clicks "Attack" on character sheet
2. Server sends `Prompt` with `kind: 'blocking'`, targeting spec in payload
3. Client renders snackbar: "Select a target" with Cancel button
4. Client activates `TargetingOverlay` with reticle cursor
5. Player clicks token on map
6. Client sends `WorkflowInput` with target selection
7. Server resolves attack, broadcasts `GameEvent`
8. Snackbar closes, targeting overlay deactivates

### Persistent Indicators

Some prompts represent ongoing states (e.g., "Concentrating on Wall of Fire"). These render as persistent snackbars until the effect ends or is dismissed.

---

## Token Movement

### Client-Side Collision Detection

The obstruction layer (walls, doors) is broadcast to clients as part of scene data. Token movement is constrained client-side:

- Dragging a token shows a preview path
- Path cannot cross solid walls (client-side pathfinding/collision)
- If token is "dropped" in an invalid location, snap to last valid position

### Live Movement Broadcast

While a token is being dragged:

1. Client sends `token.move.preview` messages at ~15-20 updates/sec (throttled)
2. Other clients render a "ghost" token at the preview position
3. On drop, client sends final `token.move` action
4. Server validates and broadcasts authoritative position
5. If server rejects (e.g., moved through wall due to race condition), client snaps token to server position

### Optimistic Updates

Client applies movement immediately for responsiveness. Server is authoritative; if server rejects, client reconciles to server state.

---

## Chat Log

The chat log displays recent GameEvents as cards. Events are filtered by `Audience` — players only see events they're allowed to see.

### Display Rules

- Show latest **n** events (configurable, default ~100-200)
- Events persist across Snapshots — if CampaignState = Snapshot + 30 events, previous events are still visible in chat
- On reconnect, client receives recent EventRecord and renders accordingly

### Rich Embeds

GameEvent cards support interactive embeds:

- Click roll result → expand to show dice breakdown
- Click spell name → open spell card in floating window
- Click actor name → open character sheet

### Event Types (examples)

| Event Type       | Card Rendering                       |
| ---------------- | ------------------------------------ |
| `chat.message`   | Text bubble with sender name         |
| `roll.result`    | Dice visualization, total, modifiers |
| `damage.applied` | Target, amount, damage type          |
| `effect.applied` | Target, effect name, duration        |
| `token.moved`    | (Usually not shown in chat)          |

---

## Floating Windows

Non-persistent, draggable windows for detailed views.

### Window Behavior

- **Z-order:** Most recently clicked window is on top
- **Draggable:** Title bar drag to reposition
- **Resizable:** (Optional) corner drag to resize
- **Close:** X button or Escape key
- **Pop-out:** (Future) Button to open in separate browser window (multi-monitor support)

### Window Types

| Window          | Opened By                               | Content                                 |
| --------------- | --------------------------------------- | --------------------------------------- |
| CharacterSheet  | Click token, click actor in sidebar     | Actor stats, inventory, abilities       |
| DocumentReader  | Click handout in Journal                | Formatted document content              |
| ItemInspector   | Click item in Compendium or inventory   | Item stats, description                 |
| InitiativeModal | Click initiative button in toolbar      | Turn order list, current turn highlight |
| SpellCard       | Click spell in Compendium or chat embed | Spell details, cast button              |

---

## Compendium Drawer

The Compendium drawer provides access to all loaded Tomes.

### Features

- **Global search:** Search across entire Compendium (all Tomes)
- **Browse by Tome:** Expand individual Tome, browse by category (spells, items, monsters, etc.)
- **Filters:** Filter by type, level, tags, etc.
- **Drag-and-drop:** Drag items/spells to character sheets, drag monsters to map (GM only)

---

## Measurement Tools

Located in the bottom toolbar. Support multiple grid types.

### Measurement Modes

| Mode           | Description                                      |
| -------------- | ------------------------------------------------ |
| Point-to-point | Click two points, show distance                  |
| Path           | Click multiple waypoints, show total path length |
| Square         | Click and drag to show square area               |
| Circle         | Click center, drag radius                        |
| Cone           | Click origin, drag to set direction and length   |

### Grid Support

- **Square grid:** Distance calculated per grid rules (diagonal handling configurable)
- **Hex grid:** Hex-aware distance calculation
- **Gridless:** Pixel-based distance with scale factor

### Visibility Toggle

Each measurement can be:

- **Private:** Only measuring player sees it
- **Public:** Broadcast to all seats, rendered on AnnotationLayer

---

## Ruleset-Controlled UI

The loaded Ruleset specifies which toolbar items are visible:

```ts
// Example Ruleset UI config (structure TBD)
{
  toolbar: {
    diceRoller: true,
    initiativeTracker: true,
    measurementTool: true,
    pingTool: true,
    // ...
  }
}
```

If a tool is disabled by the Ruleset, it is hidden from the toolbar. This allows deterministic/diceless games to hide the dice roller, narrative games to hide initiative, etc.

---

## Audio / Jukebox (Stub)

> **⚠️ TBD:** Audio implementation details are not yet defined.

Planned features:

- Ambient sound loops
- Sound effects triggered by GameEvents
- GM-controlled music playlist (jukebox)
- Per-seat volume controls

Location: Either in RightSidebar drawers or BottomToolbar. Decision deferred.

---

## Future Considerations

### Keyboard Shortcuts

Keyboard shortcuts for common actions (e.g., Escape to close windows, R to roll dice). Implementation deferred; reserve keybinding system architecture.

### Multi-Window / Pop-Out

Allow floating windows to be "popped out" into separate browser windows for multi-monitor setups. Important for GMs managing many windows.

### Mobile / Touch

Touch input support for tablets. Considerations:

- Touch-friendly button sizes
- Gesture support (pinch to zoom map, two-finger pan)
- Responsive layout for portrait/landscape

Mark touch compatibility as a requirement during implementation of each tool.

### Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation for DOM UI
- High-contrast mode option
- Colorblind-friendly token indicators (shapes, patterns, not just colors)

Implementation deferred to after basic application is functional.

---

## Renderer Public API

The WebGL renderer exposes a stable API to the application layer. UI components do not interact with WebGL directly.

```ts
interface Renderer {
  // Lifecycle
  init(canvas: HTMLCanvasElement): void;
  dispose(): void;

  // Scene management
  setScene(scene: SceneData): void;
  setAnimatedMap(videoUrl: string): void; // .mp4, .webm support

  // Token management
  updateTokens(tokens: TokenState[]): void;
  setTokenDragPreview(tokenId: TokenId, position: Position): void;
  clearTokenDragPreview(tokenId: TokenId): void;

  // Visibility and lighting
  updateVisibilityMask(mask: VisibilityMask): void;
  updateLights(lights: LightSource[]): void;

  // Effects and overlays
  addAoEEffect(effect: AoEEffect): void;
  removeAoEEffect(effectId: string): void;
  showTargetingReticle(spec: TargetSpec): void;
  hideTargetingReticle(): void;
  triggerVFX(vfx: VisualEffect): void;

  // Annotations
  addAnnotation(annotation: Annotation): void;
  removeAnnotation(annotationId: string): void;
  setMeasurementPreview(measurement: MeasurementPreview | null): void;

  // Obstruction (for client-side collision)
  getObstructions(): ObstructionData;
  isPathValid(from: Position, to: Position, tokenSize: number): boolean;

  // Input handling (renderer reports clicks, app decides action)
  onTokenClick(callback: (tokenId: TokenId) => void): void;
  onMapClick(callback: (position: Position) => void): void;
  onTokenDragStart(callback: (tokenId: TokenId) => void): void;
  onTokenDragEnd(
    callback: (tokenId: TokenId, position: Position) => void,
  ): void;
}
```

### Animated Map Support

- Supported formats: `.mp4`, `.webm`
- Video decoded and uploaded to WebGL texture each frame
- Performance consideration: max resolution/framerate may need limits on low-end devices
- Fallback: static poster frame if video fails to load

### UVTT Import

- `.uvtt` files are zip archives containing JSON + images
- Import flow: Upload → server extracts → stores scene data + assets
- Scene data includes walls, lights, grid configuration
- Renderer consumes scene data via `setScene()`

---

## Action Dispatch

UI components dispatch actions via the API layer. Actions are sent to the server via WebSocket Secure (WSS).

### WebSocket Connection

The client establishes a secure WebSocket connection using **WSS** protocol with **cookie-based authentication**:

- **Production/Internet:** Always use `wss://` with valid TLS certificates
- **Local development:** May use `ws://localhost:3000` for convenience
- **Authentication:** Session cookies (refresh token) are automatically sent during WebSocket upgrade
- **No tokens in URLs**: Auth tokens are never passed as query parameters

Connection flow:

1. Client connects to `wss://<origin>/ws`
2. Browser sends session cookies with upgrade request
3. Server validates session during upgrade handshake
4. Server sends `{ type: "welcome", seatId, campaignId }` on success
5. Server closes connection (4401 app code) if not authenticated

Reconnection:

- Use exponential backoff on disconnect
- Send `{ type: "resume", lastEventSeq }` on reconnect
- Server replies with event backlog or snapshot + deltas

### Example Action Dispatch

```ts
// Example: dispatching a dice roll
api.dispatch({
  actionType: 'roll.dice',
  payload: {
    formula: '1d20+5',
    label: 'Attack Roll',
  },
});

// Example: dispatching token movement
api.dispatch({
  actionType: 'token.move',
  payload: {
    tokenId: 'abc123',
    position: { x: 150, y: 200 },
  },
});
```

See [realtime-ws.md](../protocols/realtime-ws.md) for the complete WebSocket Secure protocol specification.

---

## State Management

Client state is managed in stores (Svelte stores or similar reactive primitives).

### Store Categories

| Store             | Contents                                           | Updated By             |
| ----------------- | -------------------------------------------------- | ---------------------- |
| `campaignState`   | Current entity state (actors, tokens, scenes)      | Server deltas          |
| `eventLog`        | Recent GameEvents for chat display                 | Server event broadcast |
| `uiState`         | Local UI state (open windows, selected tool, etc.) | User interaction       |
| `connectionState` | WSS connection status, sync state, protocol info   | API layer              |

### Sync Flow

1. On connect, server sends `sync.initial` with CampaignState + recent EventRecord
2. Client populates stores
3. Server sends `sync.delta` (patches) and `event.new` (GameEvents) as changes occur
4. Client applies patches to `campaignState`, appends events to `eventLog`
5. UI reactively updates based on store changes

---

## Directory Structure

```
client/
├── src/
│   ├── api/           # HTTP/WS client, action dispatch
│   ├── app/           # Application orchestration, routing
│   ├── domain/        # Pure domain helpers (no framework deps)
│   ├── render/        # WebGL renderer (stable public API)
│   ├── state/         # Reactive stores
│   ├── ui/            # Svelte components
│   │   ├── canvas/    # MainCanvas wrapper
│   │   ├── chat/      # ChatLog, GameEventCard
│   │   ├── drawers/   # Compendium, Journal, Settings
│   │   ├── sidebar/   # LeftSidebar, RightSidebar
│   │   ├── snackbar/  # PromptSnackbar, notifications
│   │   ├── toolbar/   # BottomToolbar, tool components
│   │   └── windows/   # Floating windows (sheets, readers)
│   └── util/          # Pure utilities
└── dist/              # Built bundle (served by server)
```

---
