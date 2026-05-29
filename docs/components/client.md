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

**New player joining a campaign:**

1. **Join Link**: User receives an invite link from the GM/admin: `GET /join/<inviteToken>`
2. **Claim Page**: Client renders the claim UI with mode toggle ("New player" / "Existing account")
3. **Claim Request**: `POST /api/auth/claim-invite` with `{ inviteToken, pin, mode, username, password }`
4. **Session Creation**: Server validates, binds seat to the PlayerAccount, sets HttpOnly refresh cookie, returns `{ accountId, campaignId, seatId, role }`
5. **Redirect to Play**: Client directed back to `/play/<campaignId>`
6. **Authenticated State**: Auth guard calls `GET /api/auth/me` on protected-route mounts; game UI loads

**Returning player with expired auth:**

1. **Splash**: User visits `/` and clicks **Play** → `/play` OR user visits `/play/<campaignId>`
2. **Auth guard**: `GET /api/auth/me` called; on 401 redirect to `/play/login?returnTo=/play`
3. **Login Page**: Username + password form. On success, session cookie set; redirect to `returnTo`
4. **Campaign Picker**: `/play` lists all campaigns the account holds seats in

**Returning player with valid auth:**

1. **Campaign Page**: User visits `/play/<campaignId>`, usually from a saved link
2. **Authenticated State**: Auth guard calls `GET /api/auth/me` on protected-route mounts
3. **That's it**: Play UI loads, player sees no intermediate pages between clicking their link and their play UI loading

### Client-side Route Table

| Route               | Component            | Auth required | Notes                                                        |
| ------------------- | -------------------- | ------------- | ------------------------------------------------------------ |
| `/`                 | `SplashPage`         | No            | 3 buttons; no session check on mount                         |
| `/join/:token`      | `JoinPage`           | No            | Login or register mode; redirects to `/play/<id>` on success |
| `/play`             | `CampaignPickerPage` | Yes           | Lists `me.seats`; empty-state if no campaigns                |
| `/play/login`       | `PlayLoginPage`      | No            | Accepts `?returnTo`; redirects after login                   |
| `/play/account`     | `PlayAccountPage`    | Yes           | Placeholder; Logout + back to `/play`                        |
| `/play/:campaignId` | `PlayLayout`         | Yes           | Full game UI                                                 |
| `/admin`            | `AdminLayout`        | Admin session | Tree SPA: Settings / Campaigns / Accounts                    |
| `/admin/login`      | `AdminLogin`         | No            | Admin password                                               |
| `/admin/setup`      | `AdminSetup`         | No            | First-time PIN ceremony                                      |
| `*`                 | `NotFoundPage`       | No            | 404 with link back to `/play`                                |

### Auth Guard Pattern

Protected routes (`play`, `play-account`, `play-campaign`) run an auth check on mount:

```ts
authState.loadMe().then((me) => {
  if (!me) navigateWithReturnTo('/play/login', window.location.pathname);
});
```

`loadMe()` calls `GET /api/auth/me`. Concurrent calls share one in-flight request. On 401 (or network failure), `me` is set to `null` and the guard redirects to `/play/login?returnTo=<currentPath>`. The `returnTo` value is validated as same-origin before use (see [returnTo contract in auth-join-flow.md](auth-join-flow.md#returnto-contract)).

### Client Responsibilities

- **Join/Claim UI**: Render invite claim page with PIN input and login/register mode toggle
- **Cookie Management**: Browser handles cookies automatically (HttpOnly, Secure, SameSite=Lax)
- **Clean URLs**: Never embed session secrets in URLs; `/play` and `/play/<campaignId>` are the stable bookmarkable routes
- **Auth Guard**: Each protected route mounts → calls `authState.loadMe()` → on 401 redirects to `/play/login?returnTo=<currentPath>`
- **Session Refresh**: Call `POST /api/auth/refresh` to get a new access token from the stable refresh cookie
- **Logout**: Call `POST /api/auth/logout`, clear local state, navigate to `/` (splash)
- **Admin UI**: Separate interface for server admin, accessed at `/admin` with its own cookie (`hearth_admin_session`)

### Admin UI vs Play UI

The client must support **two distinct interfaces**:

- **Play UI** (default): Main game interface with map, chat, character sheets, etc.
  - Used by GM, player, and spectator seats
  - Accessed via `/play` after authentication (seat-based sessions)
  - Requires claimed seat in a campaign

- **Admin UI**: Server and campaign management interface
  - **Server-level access**: Used by server admin only (not tied to any seat)
  - **Separate authentication**: Uses `hearth_admin_session` cookie (not seat-based)
  - **Tree-structured navigation**: Server settings, Campaigns → Campaign1 → Seat1, Accounts → Account1 hierarchy.
  - No map/gameplay layer; focuses on:
    - **Server settings**: Admin password management, server configuration
    - **Campaign management**: Create, delete, import, export campaigns
    - **Ruleset and Tome management**: Attach/detach content packs per campaign
    - **Seat management**: Create, update, delete seats within campaigns
    - **Invite management**: Create, revoke invites per seat
    - **Session audit**: View active sessions, revoke access
  - Routes:
    - `/admin/setup` - First-time admin setup (PIN entry)
    - `/admin/login` - Admin login (password entry)
    - `/admin` - Main admin UI (server settings, campaign tree)

**Admin UI Structure**:

```
┌─────────────────────────────────────────────────────────┐
│  AdminLayout                                            │
├─────────────────┬───────────────────────────────────────┤
│                 │                                       │
│  AdminTree      │       Detail Panel                    │
│  (Sidebar)      │                                       │
│  ○ Settings     │  • ServerSettings (Settings selected) │
│  ▼ Campaigns    │  • CampaignDetail (campaign selected) │
│    ▼ Campaign 1 │  • SeatSettings (seat selected)       │
│      ○ Seat A   │  • Accounts List (Accounts selected)  │
│      ○ Seat B   │  • Account Info (Account selected)    │
│    ○ Campaign 2 │                                       │
│  ▼ Accounts     │                                       │
│    ○ Account X  │                                       │
│                 │                                       │
└─────────────────┴───────────────────────────────────────┘
```

**Distinction**: Server admin manages **which campaigns exist** and **who can join them**. Campaign GMs manage **what happens in-game** (scenes, encounters, fog). These are separate roles that may be held by the same person in self-hosted scenarios.

See [auth-join-flow.md](auth-join-flow.md), [ADR 005](../decisions/005-networking-management.md), and [ADR 007](../decisions/007-server-level-admin.md) for complete specifications.

---

## UI Layout

### Concerns vs. visible elements

The client distinguishes between **concerns** (the data and action surfaces the SeatView exposes) and **visible elements** (one particular layout for rendering those concerns). The desktop / large-tablet UI described below is one such layout. A future mobile UI is expected to be substantially different in arrangement while consuming exactly the same `SeatView` and emitting exactly the same `EngineInput`s. The boundary is deliberate: per [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md), the engine has no opinion about layout.

The concerns rendered by the current UI:

| Concern                     | What it surfaces                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| **Map / canvas**            | Scene, tokens, drawings, fog, measurements, labels — the renderable world                  |
| **Tools**                   | Built-in tools (dice, annotation, measurement, jukebox, etc.) + ruleset-contributed panels |
| **Chat / event log**        | `recentEvents` plus the live event stream filtered for chat-like content                   |
| **Notifications / prompts** | Ephemeral notifications + `activePrompts` from `SeatView`                                  |
| **Actor status**            | Owned-actor pills, quick status overlay                                                    |
| **Document container**      | Floating windows for character sheets, journals, item cards, handouts                      |

Mobile, second-screen GM dashboards, and pop-out windows are all future _layouts_ over the same concerns. They are not parallel codebases.

### Desktop / large-tablet layout

The Play UI uses a 3-zone layout: left toolbar, central canvas with overlays, and right sidebar. All tool drawers, overlays, and notifications are layered on top of the canvas to maximize map real estate.

Target: desktop and large-format tablets. Touch-friendly button sizes are a consideration but mobile-specific layout is deferred.

```
┌────┬──────────────────────────────────────────────┬──────────────┐
│    │  ┌──QuickStatus──┐       ┌──ActorPills────┐  │              │
│    │  │ Map • 100% • ●│       │[Kael][Lyra][Thd]│ │              │
│ L  │  └───────────────┘       └────────────────┘  │              │
│ e  │                                               │  RightSidebar│
│ f  │              MainCanvas (WebGL)               │  (Chat/Event │
│ t  │                                               │   Log only)  │
│    │                                               │              │
│ T  │                                               │  Collapsible │
│ o  │                                               │  ◀ toggle    │
│ o  │                                               │              │
│ l  │                                               │              │
│ b  │  ┌──NotificationArea──────────────────────┐  │              │
│ a  │  │ [🔌 Reconnecting...] [⚔ Select target] │  │              │
│ r  │  └───────────────────────────────────────┘   │              │
└────┴──────────────────────────────────────────────┴──────────────┘
       ┌───────────────────────────────────────┐
       │   FloatingWindowLayer (tabbed windows) │
       └───────────────────────────────────────┘

  ┌────────────────────┐
  │ ToolDrawer (overlay)│  ← slides out from left toolbar edge
  │ 320px wide          │     overlays the canvas, does not push it
  │ One at a time       │
  └────────────────────┘
```

### Zone Descriptions

| Zone                    | Visibility                   | Purpose                                                                    |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| **LeftToolbar**         | All seats (GM section gated) | Narrow icon bar with grouped tools; opens drawers on click                 |
| **ToolDrawer**          | All seats (content gated)    | Slide-out panel overlaying canvas; one drawer open at a time               |
| **MainCanvas**          | All seats                    | WebGL-rendered map, tokens, fog, lighting, effects                         |
| **QuickStatus**         | All seats                    | Overlay top-left: map name, zoom, connection status; expands on hover      |
| **ActorPills**          | All seats (filtered by seat) | Overlay top-right: split-button pills for party-controlled actors          |
| **NotificationArea**    | All seats                    | Overlay bottom-left: horizontal toast stack for notifications and prompts  |
| **RightSidebar**        | All seats                    | Chat log / event log only; open by default, collapsible for more map space |
| **FloatingWindowLayer** | All seats                    | Draggable, tabbed windows for character sheets, documents, inspectors      |

### Canvas Input Model

Current bindings (implemented in `CanvasInputController`):

| Input                       | Action                                           |
| --------------------------- | ------------------------------------------------ |
| Left click on token         | Select token                                     |
| Shift + left click on token | Add to selection                                 |
| Left drag on token          | Move token (permission-gated, with live preview) |
| Left drag on empty canvas   | Marquee multi-select                             |
| Middle-click drag           | Pan                                              |
| Scroll wheel                | Zoom in/out toward cursor position               |
| Right click                 | Context menu (token or canvas)                   |
| Escape                      | Deselect all                                     |

**Known limitation:** the current controller handles all input logic directly in event handlers. Right-click and wheel are not routed through the binding table; tool-mode overrides and touch gestures are not supported. This is tracked in Tech Debt → Client → Input System and will be redesigned before those features are needed.

---

## Component Hierarchy

```
App
├── PlayLayout (3-column CSS grid)
│   ├── LeftToolbar (narrow 42px vertical icon bar)
│   │   ├── [Quick Tools — top section]
│   │   │   ├── DiceRollerDrawer (custom formula + preset buttons + history)
│   │   │   ├── AnnotationDrawer (shapes, color, weight)
│   │   │   ├── MeasurementDrawer (modes, grid-aware, public/private)
│   │   │   ├── InitiativeDrawer (turn order list, show/hide, controls)
│   │   │   └── JukeboxDrawer (playlist, transport, volume)
│   │   ├── ── divider ──
│   │   ├── [Big Tools — middle section]
│   │   │   ├── JournalDrawer (handouts, notes browser)
│   │   │   ├── CompendiumDrawer (search, browse by Tome/category)
│   │   │   └── SettingsDrawer (audio, video, UI preferences)
│   │   ├── ── divider ──
│   │   └── [GM Tools — bottom section, seat-gated]
│   │       ├── LightingDrawer (place/configure light sources)
│   │       ├── ObstructionDrawer (walls, doors, windows)
│   │       ├── SceneDrawer (map browser/selector)
│   │       ├── CampaignPrepDrawer (encounter setup, NPC staging)
│   │       ├── TokenLibraryDrawer (actor browser, drag to map)
│   │       └── GameSettingsDrawer (campaign-level game config)
│   │
│   ├── ToolDrawer (320px slide-out overlay, one at a time)
│   │   └── [Renders active drawer content component]
│   │
│   ├── Canvas Area (position: relative — anchors overlays)
│   │   ├── MainCanvas (WebGL container)
│   │   │   ├── MapLayer (static image or animated video)
│   │   │   ├── GridLayer (square, hex, or none)
│   │   │   ├── ObstructionLayer (walls — visible to GM)
│   │   │   ├── FogLayer (visibility mask)
│   │   │   ├── TokenLayer (actors with live drag previews)
│   │   │   ├── EffectLayer (persistent AoEs, auras)
│   │   │   ├── AnnotationLayer (drawings, measurements)
│   │   │   ├── LightingLayer (dynamic lights)
│   │   │   ├── TargetingOverlay (reticle for target selection)
│   │   │   └── VFXLayer (transient effects)
│   │   │
│   │   ├── QuickStatus (top-left overlay)
│   │   │   ├── Compact: map name + zoom% + connection dot
│   │   │   └── Expanded (on hover): zoom slider, grid spacing, snap toggle, connection detail
│   │   │
│   │   ├── ActorPills (top-right overlay)
│   │   │   └── ActorPill (split button per party actor)
│   │   │       ├── Main: actor name, click to center on token
│   │   │       └── Dropdown: quick stats (HP, AC, status), center, open sheet
│   │   │
│   │   └── NotificationArea (bottom-left overlay)
│   │       └── NotificationCard (per notification)
│   │           ├── Ephemeral (auto-dismiss toast)
│   │           ├── Blocking (action required — e.g., target selection)
│   │           └── Persistent (dismiss required — e.g., concentration)
│   │
│   └── RightSidebar (chat/event log only, collapsible)
│       ├── Header (campaign/map name)
│       ├── ChatLog (scrollable, not clearable)
│       │   ├── GameEventCard (roll results, damage, chat messages)
│       │   └── RichEmbed (interactive spell/item cards)
│       └── MessageInput (text input + send)
│
└── FloatingWindowLayer (z-index: most-recently-clicked on top)
    └── TabbedWindow (draggable, resizable, combinable)
        ├── Tab bar (when >1 tab; context menu to merge/detach)
        ├── CharacterSheet (per-actor stats, inventory, abilities)
        ├── DocumentReader (handouts, rulebook excerpts)
        ├── ItemInspector (item details)
        ├── InitiativeModal (sorted turn order)
        ├── SpellCard (spell details, cast button)
        └── [Dynamic based on user interaction]
```

---

## Notification System

Notifications are rendered as toast-like cards anchored to the **bottom-left corner** of the canvas area, stacking **left-to-right**. When a notification is dismissed, remaining cards compact leftward with a smooth transition. This replaces the previous SnackbarArea design.

### Notification Types

| Type         | Rendering                        | Behavior                                                                                                                                            |
| ------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ephemeral`  | Subtle toast, auto-fades         | Auto-dismisses after timeout (default 5s). No close button (e.g., "Connection restored")                                                            |
| `persistent` | Dismiss button or action buttons | Stays until explicitly dismissed. Use for prompts and ongoing states (e.g., "Select a target — [Cancel]", "Concentrating on Wall of Fire — [Drop]") |

Notification visual style is controlled separately by `kind` (`NotificationKind`): semantic values `info`, `success`, `warning`, `error`; and color values `yellow`, `purple`, `pink`, `blue`, `green`, `red`, `orange` for custom prompt styles.

### Targeting Flow Example

1. Player clicks "Attack" on character sheet
2. Server sends `Prompt` with `kind: 'blocking'`, targeting spec in payload
3. Client pushes a persistent notification with action buttons: "Select a target" + [Cancel]
4. Client activates `TargetingOverlay` with reticle cursor on canvas
5. Player clicks token on map
6. Client sends `WorkflowInput` with target selection
7. Server resolves attack, broadcasts `GameEvent`
8. Notification dismissed, targeting overlay deactivated

### Persistent Indicators

Ongoing state effects (e.g., "Concentrating on Wall of Fire") are rendered as `persistent` notifications. They remain until the effect ends server-side or the user explicitly dismisses them.

### Notification State

Managed by `notificationState` store:

```ts
type NotificationType = 'ephemeral' | 'persistent';

type NotificationKind =
  | 'info'
  | 'success'
  | 'warning'
  | 'error' // semantic
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'blue'
  | 'green'
  | 'red'
  | 'orange'; // color/prompt

interface Notification {
  id: string;
  type: NotificationType;
  kind: NotificationKind;
  message: string;
  timestamp: number;
  actions?: { label: string; onClick: () => void }[];
}
```

Methods: `push(type, kind, message, actions?)`, `dismiss(id)`, `clear()`. Convenience helpers: `info(message)`, `success(message)`, `warning(message)`, `error(message)`, `prompt(kind, message, actions)`. Ephemeral notifications auto-dismiss after `ephemeralTimeout` (default 5 000 ms).

---

## Token Movement

### Client-Side Collision Detection

The obstruction layer (walls, doors) is broadcast to clients as part of scene data. Token movement is constrained client-side:

- Dragging a token shows a preview path
- Path cannot cross solid walls (client-side pathfinding/collision)
- If token is "dropped" in an invalid location, snap to last valid position

### Live Movement Broadcast

While a token is being dragged:

1. Client is responsible for its own token rendering, pathfinding, and validation (no phasing through walls)
2. Client render a "ghost" token at the preview position, other clients see nothing
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
- Many (probably most) game events are not rendered in chat. Token moves, fog updates, redacted events, etc. are for the client renderer, dice rolls, chat messages, and ruleset-defined actions (like attacks and damage rolls) are for the renderer and chat.

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

Non-persistent, draggable, **tabbed** windows for detailed views. Windows can be combined into tab groups for efficient screen management.

### Window Behavior

- **Z-order:** Most recently clicked window group is on top
- **Draggable:** Title bar drag to reposition
- **Resizable:** (Optional) corner drag to resize
- **Close:** X button or Escape key closes the active tab (whole group if last tab)
- **Tab combining:** Right-click window title bar → "Merge into..." menu lists other open windows. Dragging a window's title bar onto another window's tab bar also merges them (implemented after context-menu merge)
- **Tab detaching:** Right-click a tab → "Detach" to pull it out into its own window group. Or drag a tab out of the tab bar
- **Pop-out:** (Future) Button to open in separate browser window (multi-monitor support)

### Tab Groups

A window group contains one or more tabs. Single-tab groups look identical to plain windows (tab bar is hidden or minimal). Multi-tab groups show a tab bar below the title:

```
┌──────────────────────────────────┐
│  Active Tab Title            ─ □ X │
├─────────┬─────────┬──────────────┤
│ Sheet A │ Sheet B │ Item Card    │  ← tab bar (only when >1 tab)
├─────────┴─────────┴──────────────┤
│                                  │
│       Active Tab Content         │
│                                  │
└──────────────────────────────────┘
```

### Window State Model

```ts
interface WindowGroup {
  id: string;
  tabs: WindowTab[];
  activeTabId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface WindowTab {
  id: string;
  title: string;
  componentType: string; // 'CharacterSheet' | 'DocumentReader' | etc.
  props: Record<string, unknown>;
}
```

Managed by `uiState.windowGroups`. Methods: `openWindow()`, `closeTab()`, `mergeGroups(sourceGroupId, targetGroupId)`, `detachTab(groupId, tabId)`, `bringGroupToFront(groupId)`.

### Window Types

| Window          | Opened By                               | Content                                 |
| --------------- | --------------------------------------- | --------------------------------------- |
| CharacterSheet  | Click token, click actor pill dropdown  | Actor stats, inventory, abilities       |
| DocumentReader  | Click handout in Journal drawer         | Formatted document content              |
| ItemInspector   | Click item in Compendium or inventory   | Item stats, description                 |
| InitiativeModal | Click initiative button in toolbar      | Turn order list, current turn highlight |
| SpellCard       | Click spell in Compendium or chat embed | Spell details, cast button              |

---

## Left Toolbar & Drawer System

The left toolbar is a narrow vertical icon bar (42px wide) that replaces the previous BottomToolbar and LeftSidebar. All tools are accessed through icons that open slide-out drawer panels.

### Toolbar Layout

Icons are arranged top-to-bottom in four sections separated by dividers. Each icon uses Lucide SVG icons with a custom `Tooltip` component for accessible hover labels.

| Section            | Visibility                                 | Tools                                                                               |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Quick Tools**    | All seats                                  | Dice roller, Map annotation, Measurement, Jukebox                                   |
| **Ruleset Panels** | All seats (panels gated by ruleset / seat) | One icon per `SeatView.rulesetPanels` entry whose `slot === 'toolbar'`              |
| **Big Tools**      | All seats                                  | Campaign journal, Player compendium, Settings                                       |
| **GM Tools**       | GM only                                    | Lighting, Obstructions, Scene selector, Campaign prep, Token library, Game settings |

Ruleset-contributed panel icons render between Quick Tools and Big Tools. Their order follows `SeatView.rulesetPanels`; the ruleset decides title/icon. The declarative `content` shape inside each panel is **deferred** per [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md) (`PanelContent` is reserved as an opaque type in `shared/`).

### Drawer Behavior

- Clicking a toolbar icon toggles its drawer panel open/closed
- Clicking a different icon switches to that drawer (one open at a time)
- Drawer slides out (320px) from the toolbar's right edge, **overlaying** the canvas
- Smooth CSS transition (`transform: translateX`) for open/close animation
- Dismissed via: click the same icon again, click outside drawer, or press Escape
- Drawer has a header (title + close button) and scrollable content area

### Ruleset-Controlled Visibility

The loaded Ruleset can **hide** built-in toolbar icons from a seat's toolbar. The underlying engine functionality remains available (dice, chat, etc.) — only the default UI affordance disappears. This lets a ruleset replace, say, a built-in initiative tracker (which the baseline engine does **not** ship; see [ruleset-engine.md](ruleset-engine.md)) with its own panel without losing the underlying dice/chat tools.

Icons not enabled by the Ruleset are simply omitted from the toolbar.

```ts
// Example Ruleset UI config (structure TBD)
{
  toolbar: {
    diceRoller: true,
    measurementTool: true,
    jukebox: true,
    // ...
  }
}
```

---

## Actor Pills

Party-controlled actors are represented as **split-button pills** positioned in the **top-right corner** of the canvas area.

### Behavior

- **Main button**: Shows actor name (truncated if needed) + optional class icon. Click centers the map on that actor's token via the renderer API
- **Dropdown caret**: Opens a flyout panel with:
  - **Quick stats**: HP bar, AC value, active status indicators (e.g., concentration icon). Stats are ruleset-determined (D&D example: HP, AC, concentration; other systems may differ)
  - **Center on Token** button
  - **Open Character Sheet** button (opens a floating window)

### Seat Permissions

- Players see pills for their own party actors only
- GM sees pills for all party actors (or none, based on preference)
- Players do **not** see pills for GM-controlled actors (NPCs, monsters)
- Pill data is `$derived` from `campaignState` filtered by seat ownership

---

## Quick Status Overlay

Unobtrusive status information positioned in the **top-left corner** of the canvas area.

### Compact Mode (Default)

Low opacity (~0.4). Displays:

- Map name
- Zoom percentage
- Connection status dot (green = connected, red = disconnected)

### Expanded Mode (On Hover)

Opacity increases to 1.0. Panel expands downward to show:

- Map name (full, untruncated)
- Zoom level with slider control
- Grid spacing (e.g., "5ft square grid", "5mi hex grid")
- Snap to grid toggle
- Connection status with text label

### Data Sources

- Map name, grid spacing, grid type: from `viewportState` (populated by renderer/scene data)
- Zoom level: from `viewportState.zoom` (updated by scroll wheel handler)
- Connection status: from `connectionState.status`

---

## Compendium Drawer

Accessed via the Compendium icon in the left toolbar's "Big Tools" section.

### Features

- **Global search:** Search across entire Compendium (all Tomes)
- **Browse by Tome:** Expand individual Tome, browse by category (spells, items, monsters, etc.)
- **Filters:** Filter by type, level, tags, etc.
- **Drag-and-drop:** (Future) Drag items/spells to character sheets, drag monsters to map (GM only)

---

## Measurement Tools

Accessed via the Measurement icon in the left toolbar's "Quick Tools" section. Opens a drawer with mode selection and options.

### Measurement Modes

| Mode           | Description                                      |
| -------------- | ------------------------------------------------ |
| Point-to-point | Click two points, show distance                  |
| Path           | Click multiple waypoints, show total path length |
| Square         | Click and drag to show square area               |
| Circle         | Click center, drag radius                        |
| Cone           | Click origin, drag to set direction and length   |
| Beam           | Click origin, drag to set direction and length   |

### Grid Support

- **Square grid:** Distance calculated per grid rules (diagonal handling configurable)
- **Hex grid:** Hex-aware distance calculation
- **Gridless:** Pixel-based distance with scale factor

### Visibility Toggle

Each measurement can be:

- **Private:** Only measuring player sees it
- **Public:** Broadcast to all seats, rendered on AnnotationLayer

---

## Audio / Jukebox

Accessed via the Jukebox icon in the left toolbar's "Quick Tools" section.

> **⚠️ TBD:** Audio implementation details are not yet defined.

Planned features:

- Ambient sound loops
- Sound effects triggered by GameEvents
- GM-controlled music playlist (jukebox)
- Per-seat volume controls

---

## Seat Permissions

All play UI elements are gated by the current seat's role. Permissions are computed as `$derived` state from `connectionState.seatId` and `campaignState`.

| Permission             | GM  | Player | Spectator |
| ---------------------- | --- | ------ | --------- |
| See GM toolbar section | ✅  | ❌     | ❌        |
| Drag own tokens        | ✅  | ✅     | ❌        |
| Drag GM tokens         | ✅  | ❌     | ❌        |
| Open radial menu (own) | ✅  | ✅     | ❌        |
| Open radial menu (GM)  | ✅  | ❌     | ❌        |
| See party actor pills  | ✅  | ✅     | ✅        |
| See GM actor pills     | ❌  | ❌     | ❌        |
| Open GM-only drawers   | ✅  | ❌     | ❌        |
| Send chat messages     | ✅  | ✅     | ❌        |

---

## Token Radial Menu (Deferred)

> **Deferred** until the WebGL renderer and token system are implemented.

Left-clicking a token will open a small custom SVG/CSS radial menu centered on the token's screen position. Initial menu segments:

- **Open Character Sheet** — opens associated actor's sheet in a floating window
- (Additional actions TBD — attack, interact, inspect, etc.)

Coordinate translation between WebGL canvas coordinates and DOM overlay coordinates is handled via a renderer API method (`tokenScreenPosition(tokenId)`). Click outside or Escape to dismiss.

---

## Future Considerations

### Keyboard Shortcuts

Keyboard shortcuts for common actions (e.g., Escape to close windows/drawers, R to roll dice). Implementation deferred; reserve keybinding system architecture.

### Multi-Window / Pop-Out

Allow floating windows to be "popped out" into separate browser windows for multi-monitor setups. Important for GMs managing many windows. The tabbed window architecture makes this straightforward — detach a tab group into a `window.open()` context.

### Drag-and-Drop from Drawers

Drag Compendium items to character sheet windows, drag actors from token library to map. Requires coordination between DOM drag events and the WebGL renderer's drop zone.

### Mobile / Touch

Touch input support for tablets. Considerations:

- Touch-friendly button sizes (toolbar icons already sized for touch at 42px)
- Gesture support (pinch to zoom map, two-finger pan)
- Responsive layout for portrait/landscape

Mark touch compatibility as a requirement during implementation of each tool. Mobile-specific layout deferred.

### Accessibility

- ARIA labels on all interactive elements (Lucide icons get `aria-label` via `Icon` wrapper)
- Keyboard navigation for DOM UI
- Custom `Tooltip` component provides accessible labels for icon-only buttons
- High-contrast mode option
- Colorblind-friendly token indicators (shapes, patterns, not just colors)
- Focus trap in floating windows and drawers

Implementation addressed incrementally as components are built.

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

Client state is managed via Svelte 5 rune-based reactive classes. Each store is a singleton class instance using `$state()` for reactive properties.

### Store Categories

| Store               | Contents                                                              | Updated By                    |
| ------------------- | --------------------------------------------------------------------- | ----------------------------- |
| `campaignState`     | Actors, tokens, scenes, effects, seat role information                | Server deltas, mock data      |
| `eventLogState`     | Recent GameEvents for chat display                                    | Server event broadcast        |
| `uiState`           | Active drawer, window groups, sidebar collapse state                  | User interaction              |
| `connectionState`   | WSS connection status, sync state, protocol info, seat ID             | API layer                     |
| `viewportState`     | Zoom level, pan offset, grid spacing/type, snap toggle, map name      | Canvas input handlers         |
| `notificationState` | Ordered array of active notifications (ephemeral/blocking/persistent) | Server prompts, system events |
| `adminAuth`         | CSRF token for admin UI (unchanged)                                   | Admin auth flow               |

### CampaignState

The `campaignState` store is the central source of truth for all game entity data. Components read from it the same way they will when connected to the real server — using typed accessor methods, not inline mock data.

```ts
class CampaignState {
  // Derived from the latest SeatView the client received; no attempt to mirror
  // the server's CampaignState shape. See ADR 011.
  campaignId = $state<string | null>(null);
  seatId = $state<string | null>(null);
  lastSeq = $state(0);

  scene = $state<SceneView | null>(null);
  tokens = $state<Map<TokenId, TokenView>>(new Map());
  actors = $state<Map<ActorId, ActorView>>(new Map());
  drawings = $state<Map<string, DrawingView>>(new Map());
  measurements = $state<Map<string, MeasurementView>>(new Map());
  labels = $state<Map<string, LabelView>>(new Map());
  fog = $state<{ explorationMask: unknown; litPolygon?: unknown } | null>(null);

  capabilities = $state<Capabilities>({
    globalActions: new Set(),
    entityActions: new Map(),
  });
  rulesetPanels = $state<RulesetPanelDef[]>([]);

  getActor(id: string): ActorView | undefined;
  getToken(id: string): TokenView | undefined;
  getPartyActors(): ActorView[];
  getActorsForSeat(seatId: string): ActorView[];

  /** Replace local state from a fresh SeatView (first connect, reconnect, resync). */
  applyView(view: SeatView): void;

  /** Apply a single incoming GameEvent to local derived state. */
  applyEvent(event: GameEvent): void;

  /** Apply an optimistic token-move locally; reverted by event-driven reconciliation if rejected. */
  optimisticMoveToken(
    tokenId: TokenId,
    position: { x: number; y: number },
  ): void;
}
```

> **Patches do not appear on the wire.** Per [ADR 011](../decisions/011-engine-facade-and-dsl-reversal.md), the client consumes a `SeatView` for resync and a stream of `GameEvent`s for steady-state play. The client does **not** apply patches; that is engine-internal.

### Seat Permissions (Derived)

Seat permissions are computed reactively from `connectionState.seatId` and `campaignState`:

```ts
// Conceptual — computed via $derived
const seatPermissions = $derived({
  canSeeGMTools: seatRole === 'gm',
  canDragToken: (actorId: string) => /* ownership check */,
  visibleActorPills: /* filtered party actors */,
});
```

### Sync Flow

1. On WS connect, server sends `{ type: 'view', view: SeatView }` containing the seat's full visible projection plus a bounded `recentEvents` log and `activePrompts`.
2. Client calls `campaignState.applyView(view)`. `lastSeq` is recorded.
3. Server streams `{ type: 'event', event: GameEvent }` messages. Each carries a per-campaign `seq`.
4. Client calls `campaignState.applyEvent(event)` and `eventLogState.addEvent(event)`. The client's `lastSeq` advances by exactly 1 on each event.
5. If `event.seq !== lastSeq + 1`, the client requests a fresh `SeatView` from the server (`{ type: 'view.request' }`) and resumes from the new `lastSeq`.
6. UI reactively updates via `$state` / `$derived`.

For optimistic token moves: the client dispatches the action, applies the move locally, and waits. Server-confirm (`token.moved` event) matches the optimistic state and is a visual no-op. Server-reject (`token.move.rejected` event) snaps the token back; the lit-area overlay updates automatically because it's derived from token position.

---

## Directory Structure

```
client/
├── src/
│   ├── api/               # HTTP/WS client, action dispatch
│   ├── app/               # Application orchestration, routing
│   ├── domain/            # Pure domain helpers (no framework deps)
│   ├── render/            # WebGL renderer (stable public API)
│   ├── state/             # Reactive stores
│   │   ├── admin.svelte.ts
│   │   ├── campaign.svelte.ts
│   │   ├── connection.svelte.ts
│   │   ├── event-log.svelte.ts
│   │   ├── notifications.svelte.ts
│   │   ├── ui.svelte.ts
│   │   └── viewport.svelte.ts
│   ├── styles/            # Global CSS tokens and component classes
│   │   ├── tokens.css
│   │   └── components.css
│   ├── ui/                # Svelte components
│   │   ├── admin/         # Admin UI (unchanged)
│   │   ├── auth/          # Join/login pages
│   │   ├── canvas/        # MainCanvas, QuickStatus, ActorPills
│   │   ├── layout/        # PlayLayout, AdminLayout
│   │   ├── notifications/ # NotificationArea, NotificationCard
│   │   ├── shared/        # Icon, Tooltip, reusable primitives
│   │   ├── sidebar/       # RightSidebar, ChatLog, GameEventCard
│   │   ├── toolbar/       # LeftToolbar, ToolDrawer
│   │   │   └── drawers/   # All drawer content components
│   │   └── window/        # FloatingWindowLayer, TabbedWindow, FloatingWindow, content windows
│   └── util/              # Pure utilities
└── dist/                  # Built bundle (served by server)
```

---
