<script lang="ts">
  /**
   * ContextMenu — Canvas right-click context menu.
   *
   * Rendered as a DOM overlay positioned at the cursor's screen coordinates.
   * Dismisses on outside click or Escape. Uses a transparent full-screen
   * backdrop so pointer events outside the menu bubble to the backdrop handler.
   *
   * Item groups are keyed to the `kind` of the context menu target:
   *   - 'token'  → token-specific actions (inspect, move, remove)
   *   - 'canvas' → canvas-space actions (ping, waypoint, measure)
   *
   * NOTE: All items are placeholder stubs. Real implementations will be wired
   *       up once the underlying actions exist (Phase 3+ of implementation plan).
   */

  import { uiState } from '../../state/ui.svelte';

  const close = () => uiState.closeContextMenu();

  // Close on Escape key while the menu is open.
  $effect(() => {
    if (!uiState.contextMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });
</script>

{#if uiState.contextMenu !== null}
  {@const menu = uiState.contextMenu}

  <!-- Transparent backdrop: captures outside clicks to dismiss the menu -->
  <div
    class="context-menu-backdrop"
    aria-hidden="true"
    onclick={close}
    oncontextmenu={(e) => { e.preventDefault(); close(); }}
  ></div>

  <!-- Menu panel, absolutely positioned at the cursor -->
  <div
    class="context-menu"
    style="left: {menu.screenX}px; top: {menu.screenY}px"
    role="menu"
    tabindex="-1"
    aria-label={menu.kind === 'token' ? 'Token actions' : 'Canvas actions'}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#if menu.kind === 'token'}
      <div class="context-menu-header">Token</div>
      <button class="context-menu-item" role="menuitem" disabled>Inspect Token</button>
      <button class="context-menu-item" role="menuitem" disabled>Move Token</button>
      <hr class="context-menu-divider" />
      <button class="context-menu-item context-menu-item--danger" role="menuitem" disabled>
        Remove Token
      </button>
    {:else if menu.kind === 'canvas'}
      <div class="context-menu-header">Canvas</div>
      <button class="context-menu-item" role="menuitem" disabled>Ping Location</button>
      <button class="context-menu-item" role="menuitem" disabled>Add Waypoint</button>
      <button class="context-menu-item" role="menuitem" disabled>Measure from Here</button>
    {/if}
  </div>
{/if}

<style>
  /* Full-screen invisible backdrop — sits below the menu, above everything else */
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-context-menu-backdrop);
    cursor: default;
  }

  .context-menu {
    position: fixed;
    z-index: var(--z-context-menu);
    min-width: 180px;
    padding: var(--space-xs) 0;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);

    /* Prevent the backdrop click from immediately closing the menu */
    pointer-events: auto;
  }

  .context-menu-header {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    cursor: default;
    user-select: none;
  }

  .context-menu-item {
    display: block;
    width: 100%;
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: none;
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    cursor: pointer;
    white-space: nowrap;
    transition: background 80ms ease;
  }

  .context-menu-item:not(:disabled):hover {
    background: var(--color-bg-hover);
  }

  .context-menu-item:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .context-menu-item--danger {
    color: var(--color-danger);
  }

  .context-menu-item--danger:not(:disabled):hover {
    background: var(--color-danger-faint);
  }

  .context-menu-divider {
    margin: var(--space-xs) 0;
    border: none;
    border-top: 1px solid var(--color-border-subtle);
  }
</style>
