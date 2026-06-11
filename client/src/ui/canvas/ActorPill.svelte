<script lang="ts">
  /**
   * ActorPill - Individual actor pill component.
   *
   * Split-button design with main button (center on token) and dropdown toggle.
   *
   * NOTE: D&D-specific stats (HP bar, AC, level/class, conditions) were removed
   * in Engine v0.2 Schema De-D&D-ification. Stats now live in actor.data and
   * are rendered by ruleset-defined UI components (future work).
   */

  import { ChevronDown, User, Crosshair, ScrollText } from 'lucide-svelte';
  import type { Actor } from '@hearth-vtt/shared';
  import Icon from '../shared/Icon.svelte';

  interface Props {
    actor: Actor;
    isActive: boolean;
    /** True when the current seat has read-only access to this actor (cannot control). */
    isReadOnly?: boolean;
    ontoggle: (actorId: string) => void;
    oncenter: (actorId: string) => void;
    onopensheet: (actorId: string) => void;
  }

  let { actor, isActive, isReadOnly = false, ontoggle, oncenter, onopensheet }: Props = $props();

  // Position tracking for dropdown
  let pillElement: HTMLDivElement | null = $state(null);
  let dropdownTop = $state(0);
  let dropdownLeft = $state(0);

  /**
   * Update dropdown position when it becomes active.
   */
  $effect(() => {
    if (isActive && pillElement) {
      const rect = pillElement.getBoundingClientRect();
      dropdownTop = rect.bottom + 4; // 4px gap (var(--space-xs))
      dropdownLeft = rect.right - 240; // Align right edge (240px = dropdown width)
    }
  });
</script>

<div class="actor-pill" class:actor-pill--readonly={isReadOnly} bind:this={pillElement}>
  <!-- Main button: click to center on token -->
  <button
    class="actor-pill__main"
    onclick={() => oncenter(actor.id)}
    title="Center on {actor.name}"
  >
    <div class="actor-pill__avatar">
      <Icon icon={User} size={14} label="Avatar" />
    </div>
    <span class="actor-pill__name">{actor.name}</span>
  </button>

  <!-- Divider -->
  <div class="actor-pill__divider"></div>

  <!-- Dropdown toggle -->
  <button
    class="actor-pill__dropdown"
    onclick={(e) => {
      e.stopPropagation();
      ontoggle(actor.id);
    }}
    title="Quick stats"
  >
    <Icon icon={ChevronDown} size={14} label="Expand quick stats" />
  </button>

</div>

<!-- Dropdown menu -->
{#if isActive}
  <div
    class="actor-pill-dropdown"
    style:top="{dropdownTop}px"
    style:left="{dropdownLeft}px"
  >
    <!--
      D&D-specific stats (HP bar, AC, level/class, conditions) removed in
      Engine v0.2. Ruleset-defined UI components will replace these when
      the ruleset client-component system is designed.
    -->

    <!-- Action Buttons -->
    <div class="pill-dropdown-actions">
      <button class="pill-action-btn" onclick={() => oncenter(actor.id)}>
        <Icon icon={Crosshair} size={16} label="Center on token" />
        <span>Center</span>
      </button>
      <button class="pill-action-btn" onclick={() => onopensheet(actor.id)}>
        <Icon icon={ScrollText} size={16} label="Open character sheet" />
        <span>Open Sheet</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .actor-pill {
    position: relative;
  }

  /* Read-only pill: player can view but not control this actor */
  .actor-pill--readonly {
    opacity: 0.7;
  }

  /* Dropdown Menu */
  .actor-pill-dropdown {
    position: fixed;
    width: 240px;
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-md);
    z-index: var(--z-dropdown);
  }

  /* Action Buttons */
  .pill-dropdown-actions {
    display: flex;
    gap: var(--space-sm);
    padding-top: var(--space-md);
  }

  .pill-action-btn {
    flex: 1;
    padding: var(--space-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .pill-action-btn:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }
</style>
