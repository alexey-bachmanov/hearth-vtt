<script lang="ts">
/**
 * TabbedWindow - Draggable floating window shell with tab support.
 *
 * Architecture:
 * - Reads all group/tab state from uiState by groupId — no prop drilling for
 *   window data.
 * - Position, size, and z-index live on WindowGroup in uiState; dragging is
 *   committed on mouseup so the state store is only updated once per gesture.
 *   During the gesture, local $state variables (localX/localY) drive the
 *   rendered position for smooth dragging without continuous store writes.
 * - Content is dispatched via the WINDOW_CONTENT registry keyed by WindowId.
 *   To register a new window type, see the registry comment below.
 *
 * Single-tab: tab bar is hidden; renders identical to a plain window frame.
 * Multi-tab: tab strip appears in the header. Each tab has its own close ×.
 *   The window closes automatically when the last tab is closed.
 *
 * Context menus:
 * - Right-click the header area: list other groups to merge this one into.
 * - Right-click a tab: "Detach tab" plus merge options.
 *
 * Drag-to-combine:
 * - While dragging the header, the current cursor position is tested against
 *   every other group's bounding box (read from uiState — no DOM queries).
 * - If the cursor lands inside another group's header strip, that group
 *   becomes the drop target: it receives the .tabbed-window--drop-target CSS
 *   modifier via `dropTargetGroupId` published to uiState.dropTargetGroupId.
 * - On mouseup over a target: mergeGroups(thisGroup, target) is called
 *   instead of updateGroupPosition.
 * - Drop-target detection uses the header strip height (--window-tab-height)
 *   because dropping onto the body of another window is intentionally ignored
 *   — users should only merge by dragging one window's header onto another's.
 *
 * Drag-to-detach:
 * - Mousedown on a tab label begins tracking a potential tab drag.
 * - If the cursor moves more than TAB_DETACH_THRESHOLD px before mouseup,
 *   uiState.detachTab() is called, creating a new single-tab group positioned
 *   under the cursor (header centred on the cursor).
 * - To make the detach feel seamless, the new group's drag is handed off via
 *   uiState.pendingDragCapture: a $effect in every TabbedWindow watches for
 *   its groupId in that field and immediately enters drag mode without
 *   requiring the user to release and re-grab the mouse.
 *
 * Pop-out readiness: content components receive only the serializable
 * `context` props from WindowMeta, making them mountable in a standalone
 * /window route in the future. `poppedOut` flag is reserved on WindowGroup.
 *
 * Context key conventions per window type:
 *   'actor-sheet'   → context.characterId (string)
 *   'token-config'  → context.itemId (string)
 *   'scene-config'  → context.documentId (string)
 *   'campaign-prep' → no required context keys
 *   'settings'      → no required context keys
 */

import { uiState, type WindowId, WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT, WINDOW_DEFAULT_WIDTH, WINDOW_DEFAULT_HEIGHT } from '../../state/ui.svelte';
import type { Component } from 'svelte';
import CharacterSheet from './CharacterSheet.svelte';
import DocumentReader from './DocumentReader.svelte';
import ItemInspector from './ItemInspector.svelte';
import { campaignState } from '../../state/campaign.svelte';
import RulesetWindow from '../ruleset/RulesetWindow.svelte';

// ============================================================================
// Content registry
//
// Maps WindowId → Svelte content component.
// To add a new window type:
//   1. Add its ID to the WindowId union in ui.svelte.ts.
//   2. Create the content component in ui/window/.
//   3. Add the mapping below.
//   4. Document the expected context keys in the JSDoc above.
//
// Components receive WindowMeta.context spread as props, so context keys must
// match the component's declared prop names.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WINDOW_CONTENT: Partial<Record<WindowId, Component<any>>> = {
  'actor-sheet': CharacterSheet,
  'token-config': ItemInspector,
  'scene-config': DocumentReader,
  // 'settings' intentionally omitted until the component is implemented
};

// ============================================================================
// Props
// ============================================================================

interface Props {
  groupId: string;
}

let { groupId }: Props = $props();

// ============================================================================
// Derived state (reactive reads from uiState)
// ============================================================================

let group = $derived(uiState.windowGroups.get(groupId));

let tabs = $derived(
  group?.tabs
    .map((id) => uiState.openWindows.get(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined) ?? [],
);

let activeTab = $derived(group ? uiState.openWindows.get(group.activeTabId) : undefined);

let contentComponent = $derived(activeTab ? (WINDOW_CONTENT[activeTab.type] ?? null) : null);

let isMultiTab = $derived(tabs.length > 1);

/**
 * Other open groups — used to populate "Merge into …" options in the context
 * menu. Title is taken from the group's currently active tab.
 */
let otherGroups = $derived(
  [...uiState.windowGroups.values()]
    .filter((g) => g.id !== groupId)
    .map((g) => ({
      id: g.id,
      title: uiState.openWindows.get(g.activeTabId)?.title ?? 'Untitled',
    })),
);

// ============================================================================
// Drag state
// ============================================================================
//
// Declared before the $derived expressions below that reference them.

let isDragging = $state(false);
let localX = $state(0);
let localY = $state(0);

// ============================================================================
// Resize state
//
// Plain lets for non-reactive anchors; $state only for values that drive
// template rendering during the gesture.
// ============================================================================

/** One of the 8 compass directions, set when a resize gesture is active. */
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

let isResizing = $state(false);
let localWidth = $state(0);
let localHeight = $state(0);
/** Position may shift during n/w/nw/ne/sw resizes (opposite edge stays fixed). */
let localResizeX = $state(0);
let localResizeY = $state(0);

// Non-reactive resize anchors (read only on mouseup / in mousemove math).
let resizeDir: ResizeDir = 'se';
let resizeAnchorX = 0;
let resizeAnchorY = 0;
let resizeBaseX = 0;
let resizeBaseY = 0;
let resizeBaseWidth = 0;
let resizeBaseHeight = 0;

// Rendered position: local state during drag or resize, group state otherwise.
let renderX = $derived(isDragging ? localX : isResizing ? localResizeX : (group?.x ?? 0));
let renderY = $derived(isDragging ? localY : isResizing ? localResizeY : (group?.y ?? 0));

// Rendered size: local state during resize, group state otherwise.
let renderWidth = $derived(isResizing ? localWidth : (group?.width ?? WINDOW_DEFAULT_WIDTH));
let renderHeight = $derived(isResizing ? localHeight : (group?.height ?? WINDOW_DEFAULT_HEIGHT));

// Whether this group is the current drop target of another window's drag.
let isDropTarget = $derived(uiState.dropTargetGroupId === groupId);

// Non-reactive drag anchors (only read on mouseup, no need to re-render).
let dragAnchorX = 0;
let dragAnchorY = 0;
let baseX = 0;
let baseY = 0;

/**
 * The height of the header strip used for drop-target hit testing.
 * Must stay in sync with the --window-tab-height CSS token (32px).
 */
const HEADER_HIT_HEIGHT = 32;

// ============================================================================
// Tab drag-to-detach state
//
// Plain (non-reactive) variables because they don't drive template rendering.
// ============================================================================

/** windowId of the tab being dragged, or null when no tab drag is in progress. */
let tabDragWindowId: string | null = null;
let tabDragStartX = 0;
let tabDragStartY = 0;

/**
 * How many pixels the cursor must move from the mousedown point before
 * the tab is detached into its own window.
 */
const TAB_DETACH_THRESHOLD = 20;

/**
 * Seamless drag handoff: when another TabbedWindow detaches a tab, it writes
 * the new group's ID and drag anchors into uiState.pendingDragCapture. We
 * pick that up here, claim it (set to null) and immediately enter drag mode so
 * the user never has to release and re-grab the mouse.
 */
$effect(() => {
  const capture = uiState.pendingDragCapture;
  if (capture?.groupId === groupId) {
    uiState.pendingDragCapture = null;
    isDragging = true;
    dragAnchorX = capture.anchorX;
    dragAnchorY = capture.anchorY;
    baseX = capture.baseX;
    baseY = capture.baseY;
    localX = baseX;
    localY = baseY;
    uiState.bringGroupToFront(groupId);
  }
});

/**
 * Find the group whose header strip contains the given viewport point,
 * excluding our own group. Returns the group id or null.
 *
 * Hit area is the header strip only (top HEADER_HIT_HEIGHT px of the group),
 * so users must aim for another window's header — not just overlap the body.
 */
function findDropTarget(cursorX: number, cursorY: number): string | null {
  for (const [id, g] of uiState.windowGroups) {
    if (id === groupId) continue;
    const inHeader =
      cursorX >= g.x &&
      cursorX <= g.x + g.width &&
      cursorY >= g.y &&
      cursorY <= g.y + HEADER_HIT_HEIGHT;
    if (inHeader) return id;
  }
  return null;
}

/**
 * Start a drag gesture from the title/tab-bar header area.
 * Skips interactive children (buttons) so tabs and close buttons keep working.
 */
function handleHeaderMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  // Let button clicks pass through without starting a drag.
  if ((event.target as HTMLElement).closest('button')) return;

  event.preventDefault();

  isDragging = true;
  dragAnchorX = event.clientX;
  dragAnchorY = event.clientY;
  baseX = group?.x ?? 0;
  baseY = group?.y ?? 0;
  localX = baseX;
  localY = baseY;

  uiState.bringGroupToFront(groupId);
}

/**
 * Track the start of a potential tab drag-to-detach gesture.
 * The header mousedown guard already skips buttons, but tab buttons call this
 * explicitly via onmousedown so we can track the originating tab.
 */
function handleTabMouseDown(event: MouseEvent, windowId: string) {
  if (event.button !== 0) return;
  tabDragWindowId = windowId;
  tabDragStartX = event.clientX;
  tabDragStartY = event.clientY;
}

function handleWindowMouseMove(event: MouseEvent) {
  // Resize gesture: compute new size (and position for n/w edges).
  if (isResizing) {
    const dx = event.clientX - resizeAnchorX;
    const dy = event.clientY - resizeAnchorY;

    if (resizeDir.includes('e')) {
      localWidth = Math.max(resizeBaseWidth + dx, WINDOW_MIN_WIDTH);
    }
    if (resizeDir.includes('w')) {
      const clamped = Math.max(resizeBaseWidth - dx, WINDOW_MIN_WIDTH);
      localWidth = clamped;
      // Shift x so the right edge stays anchored.
      localResizeX = resizeBaseX + (resizeBaseWidth - clamped);
    }
    if (resizeDir.includes('s')) {
      localHeight = Math.max(resizeBaseHeight + dy, WINDOW_MIN_HEIGHT);
    }
    if (resizeDir.includes('n')) {
      const clamped = Math.max(resizeBaseHeight - dy, WINDOW_MIN_HEIGHT);
      localHeight = clamped;
      // Shift y so the bottom edge stays anchored.
      localResizeY = resizeBaseY + (resizeBaseHeight - clamped);
    }
    return;
  }

  // Tab drag: check whether the cursor has exceeded the detach threshold.
  if (tabDragWindowId !== null && !isDragging) {
    const dx = event.clientX - tabDragStartX;
    const dy = event.clientY - tabDragStartY;
    if (Math.hypot(dx, dy) > TAB_DETACH_THRESHOLD) {
      const detachId = tabDragWindowId;
      tabDragWindowId = null;
      // Place the new window so its header is centred under the cursor.
      const newX = event.clientX - (group?.width ?? 480) / 2;
      const newY = event.clientY - HEADER_HIT_HEIGHT / 2;
      const newGroupId = uiState.detachTab(detachId, newX, newY);
      if (newGroupId) {
        // Signal the new TabbedWindow to enter drag mode immediately.
        uiState.pendingDragCapture = {
          groupId: newGroupId,
          anchorX: event.clientX,
          anchorY: event.clientY,
          baseX: newX,
          baseY: newY,
        };
      }
    }
    // Don't also move this window while tracking a tab drag.
    return;
  }

  if (!isDragging) return;
  localX = baseX + (event.clientX - dragAnchorX);
  localY = baseY + (event.clientY - dragAnchorY);

  // Hit-test cursor position against other groups' header strips.
  uiState.dropTargetGroupId = findDropTarget(event.clientX, event.clientY);
}

function handleWindowMouseUp() {
  // Always clear tab drag tracking on mouseup (covers click-without-drag).
  tabDragWindowId = null;

  // Commit resize gesture.
  if (isResizing) {
    isResizing = false;
    uiState.updateGroupSize(groupId, localWidth, localHeight, localResizeX, localResizeY);
    return;
  }

  if (!isDragging) return;
  isDragging = false;

  const target = uiState.dropTargetGroupId;
  uiState.dropTargetGroupId = null;

  if (target) {
    // Drop onto another window header → merge.
    uiState.mergeGroups(groupId, target);
  } else {
    // Normal drop → commit position.
    uiState.updateGroupPosition(groupId, localX, localY);
  }
}

// ============================================================================
// Resize handle
// ============================================================================

/**
 * Begin a resize gesture from one of the 8 handles.
 *
 * stopPropagation prevents handleWindowMouseDown from co-firing (which would
 * call bringGroupToFront redundantly) and prevents handleHeaderMouseDown from
 * starting a drag when the n/nw/ne handles overlap the header edge.
 */
function handleResizeMouseDown(event: MouseEvent, dir: ResizeDir) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  isResizing = true;
  resizeDir = dir;
  resizeAnchorX = event.clientX;
  resizeAnchorY = event.clientY;
  resizeBaseX = group?.x ?? 0;
  resizeBaseY = group?.y ?? 0;
  resizeBaseWidth = group?.width ?? WINDOW_DEFAULT_WIDTH;
  resizeBaseHeight = group?.height ?? WINDOW_DEFAULT_HEIGHT;
  localWidth = resizeBaseWidth;
  localHeight = resizeBaseHeight;
  localResizeX = resizeBaseX;
  localResizeY = resizeBaseY;

  uiState.bringGroupToFront(groupId);
}

// ============================================================================
// Click-to-front (body area; header already handled in startDrag)
// ============================================================================

function handleWindowMouseDown(event: MouseEvent) {
  // Header drag already calls bringGroupToFront; avoid a redundant call.
  if ((event.target as HTMLElement).closest('.tabbed-window__header')) return;
  uiState.bringGroupToFront(groupId);
}

// ============================================================================
// Tab management
// ============================================================================

function handleTabClick(event: MouseEvent, windowId: string) {
  event.stopPropagation();
  uiState.setActiveTab(groupId, windowId);
}

function handleTabClose(event: MouseEvent, windowId: string) {
  event.stopPropagation();
  uiState.closeTab(windowId);
}

function handleWindowClose() {
  if (activeTab) {
    uiState.closeTab(activeTab.id);
  }
}

// ============================================================================
// Context menu
// ============================================================================

interface ContextMenuState {
  x: number;
  y: number;
  /** Set when right-clicking a specific tab; enables the "Detach tab" option. */
  tabId?: string;
}

let contextMenu = $state<ContextMenuState | null>(null);

function handleHeaderContextMenu(event: MouseEvent) {
  event.preventDefault();
  contextMenu = { x: event.clientX, y: event.clientY };
}

function handleTabContextMenu(event: MouseEvent, tabId: string) {
  event.preventDefault();
  event.stopPropagation();
  contextMenu = { x: event.clientX, y: event.clientY, tabId };
}

function handleMerge(targetGroupId: string) {
  uiState.mergeGroups(groupId, targetGroupId);
  contextMenu = null;
}

function handleDetach(windowId: string) {
  // Offset the new group slightly so it doesn't overlap exactly.
  const x = (group?.x ?? 0) + 30;
  const y = (group?.y ?? 0) + 30;
  uiState.detachTab(windowId, x, y);
  contextMenu = null;
}

// ============================================================================
// Keyboard navigation
// ============================================================================

/**
 * Reference to the single-tab close button — focused on Escape.
 * Null in multi-tab mode; Escape is a graceful no-op in that case.
 *
 * Note: TabbedWindow is a non-modal floating panel — it does not block the
 * rest of the UI. We do NOT implement a Tab focus trap; Tab flows normally
 * through the page so users can keep a window open and interact with the
 * canvas, toolbar, and chat simultaneously. Escape gives keyboard users a
 * deliberate shortcut to dismiss the window without disrupting Tab flow.
 */
let closeBtn: HTMLButtonElement | null = $state(null);

function handleDialogKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeBtn?.focus();
  }
}

// Close context menu when clicking outside it.
function handleGlobalClick(event: MouseEvent) {
  if (contextMenu && !(event.target as HTMLElement).closest('.tabbed-window__context-menu')) {
    contextMenu = null;
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    contextMenu = null;
    tabDragWindowId = null;
    // Cancel an active resize gesture.
    if (isResizing) {
      isResizing = false;
      localWidth = group?.width ?? WINDOW_DEFAULT_WIDTH;
      localHeight = group?.height ?? WINDOW_DEFAULT_HEIGHT;
      localResizeX = group?.x ?? 0;
      localResizeY = group?.y ?? 0;
    }
    // If we were dragging, cancel it cleanly.
    if (isDragging) {
      isDragging = false;
      uiState.dropTargetGroupId = null;
    }
  }
}
</script>

<svelte:window
  onmousemove={handleWindowMouseMove}
  onmouseup={handleWindowMouseUp}
  onclick={handleGlobalClick}
  onkeydown={handleGlobalKeydown}
/>

{#if group}
  <div
    class="tabbed-window"
    class:tabbed-window--dragging={isDragging}
    class:tabbed-window--resizing={isResizing}
    class:tabbed-window--drop-target={isDropTarget}
    style="left: {renderX}px; top: {renderY}px; width: {renderWidth}px; height: {renderHeight}px; z-index: {group.zIndex};"
    onmousedown={handleWindowMouseDown}
    onkeydown={handleDialogKeyDown}
    role="dialog"
    aria-labelledby="tabbed-window-{group.id}-label"
    tabindex="-1"
  >
    <!-- Visually-hidden label referenced by aria-labelledby. -->
    <span id="tabbed-window-{group.id}-label" class="sr-only">{activeTab?.title ?? 'Window'}</span>

    <!-- ================================================================
         Header: tab strip (multi-tab) or title bar (single tab)
         ================================================================ -->
    <div
      class="tabbed-window__header"
      onmousedown={handleHeaderMouseDown}
      oncontextmenu={handleHeaderContextMenu}
      role="presentation"
    >
      {#if isMultiTab}
        <!-- Tab strip -->
        <div class="tabbed-window__tab-bar" role="tablist">
          {#each tabs as tab (tab.id)}
            <button
              class="tabbed-window__tab"
              class:tabbed-window__tab--active={tab.id === group.activeTabId}
              role="tab"
              aria-selected={tab.id === group.activeTabId}
              onmousedown={(e) => handleTabMouseDown(e, tab.id)}
              onclick={(e) => handleTabClick(e, tab.id)}
              oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
            >
              <span class="tabbed-window__tab-label">{tab.title}</span>
              <span
                class="tabbed-window__tab-close"
                role="button"
                tabindex="0"
                aria-label="Close {tab.title}"
                onclick={(e) => handleTabClose(e, tab.id)}
                onkeydown={(e) => e.key === 'Enter' && handleTabClose(e as unknown as MouseEvent, tab.id)}
              >✕</span>
            </button>
          {/each}
        </div>
      {:else}
        <!-- Single-tab title bar -->
        <div class="tabbed-window__title-bar">
          <h4 class="tabbed-window__title">{activeTab?.title ?? ''}</h4>
          <button
            bind:this={closeBtn}
            class="tabbed-window__close"
            aria-label="Close window"
            onclick={handleWindowClose}
          >✕</button>
        </div>
      {/if}
    </div>

    <!-- ================================================================
         Content area
         ================================================================ -->
    <div class="tabbed-window__body" role="tabpanel">
      {#if activeTab?.type === 'ruleset-panel'}
        {@const panel = campaignState.rulesetPanels.find(p => p.id === activeTab.context?.panelId)}
        {#if panel}
          <RulesetWindow {panel} />
        {:else}
          <div class="tabbed-window__empty">Panel not found: {activeTab.title}</div>
        {/if}
      {:else if contentComponent}
        {@const Comp = contentComponent}
        <Comp {...(activeTab?.context ?? {})} />
      {:else if activeTab}
        <div class="tabbed-window__empty">
          {activeTab.title} — not yet implemented
        </div>
      {/if}
    </div>

    <!-- ================================================================
         Resize handles (8 directions)
         Transparent hit areas — cursor change signals the affordance.
         n/nw/ne sit at the top edge and intentionally overlap the header
         by 8 px; stopPropagation in handleResizeMouseDown isolates them
         from the header drag handler.
         ================================================================ -->
    <div class="tabbed-window__resize-n"  onmousedown={(e) => handleResizeMouseDown(e, 'n')}  role="presentation"></div>
    <div class="tabbed-window__resize-ne" onmousedown={(e) => handleResizeMouseDown(e, 'ne')} role="presentation"></div>
    <div class="tabbed-window__resize-e"  onmousedown={(e) => handleResizeMouseDown(e, 'e')}  role="presentation"></div>
    <div class="tabbed-window__resize-se" onmousedown={(e) => handleResizeMouseDown(e, 'se')} role="presentation"></div>
    <div class="tabbed-window__resize-s"  onmousedown={(e) => handleResizeMouseDown(e, 's')}  role="presentation"></div>
    <div class="tabbed-window__resize-sw" onmousedown={(e) => handleResizeMouseDown(e, 'sw')} role="presentation"></div>
    <div class="tabbed-window__resize-w"  onmousedown={(e) => handleResizeMouseDown(e, 'w')}  role="presentation"></div>
    <div class="tabbed-window__resize-nw" onmousedown={(e) => handleResizeMouseDown(e, 'nw')} role="presentation"></div>
  </div>

  <!-- ================================================================
       Context menu (position: fixed, renders at cursor position)
       ================================================================ -->
  {#if contextMenu}
    <div
      class="tabbed-window__context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
      role="menu"
    >
      {#if contextMenu.tabId}
        <button
          class="tabbed-window__context-menu-item"
          role="menuitem"
          onclick={() => contextMenu?.tabId && handleDetach(contextMenu.tabId)}
        >
          Detach tab
        </button>
        {#if otherGroups.length > 0}
          <div class="tabbed-window__context-menu-separator" role="separator"></div>
        {/if}
      {/if}

      {#each otherGroups as other (other.id)}
        <button
          class="tabbed-window__context-menu-item"
          role="menuitem"
          onclick={() => handleMerge(other.id)}
        >
          Merge into "{other.title}"
        </button>
      {/each}

      {#if !contextMenu.tabId && otherGroups.length === 0}
        <div class="tabbed-window__context-menu-item tabbed-window__context-menu-item--disabled">
          No other windows to merge into
        </div>
      {/if}
    </div>
  {/if}
{/if}
