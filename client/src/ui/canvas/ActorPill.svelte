<script lang="ts">
  /**
   * ActorPill - Individual actor pill component.
   *
   * Split-button design with main button (center on token) and dropdown toggle (quick stats).
   */

  import { ChevronDown, User, Crosshair, ScrollText } from 'lucide-svelte';
  import type { Actor } from '../../state/campaign.svelte';
  import Icon from '../shared/Icon.svelte';

  interface Props {
    actor: Actor;
    isActive: boolean;
    ontoggle: (actorId: string) => void;
    oncenter: (actorId: string) => void;
    onopensheet: (actorId: string) => void;
  }

  let { actor, isActive, ontoggle, oncenter, onopensheet }: Props = $props();

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

  /**
   * Calculate HP percentage for progress bar.
   */
  function getHpPercentage(current: number, max: number): number {
    return Math.max(0, Math.min(100, (current / max) * 100));
  }

  /**
   * Get HP bar color based on percentage.
   */
  function getHpColor(percentage: number): string {
    if (percentage > 50) return 'var(--color-success)';
    if (percentage > 25) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }
</script>

<div class="actor-pill" bind:this={pillElement}>
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
    <!-- Quick Stats Section -->
    <div class="pill-dropdown-stats">
      <!-- HP Bar -->
      <div class="stat-row">
        <span class="stat-label">HP</span>
        <div class="hp-bar-container">
          <div
            class="hp-bar-fill"
            style:width="{getHpPercentage(actor.hp.current, actor.hp.max)}%"
            style:background-color={getHpColor(
              getHpPercentage(actor.hp.current, actor.hp.max),
            )}
          ></div>
          <span class="hp-bar-text">{actor.hp.current} / {actor.hp.max}</span>
        </div>
      </div>

      <!-- AC -->
      <div class="stat-row">
        <span class="stat-label">AC</span>
        <span class="stat-value">{actor.ac}</span>
      </div>

      <!-- Level & Class -->
      {#if actor.level && actor.class}
        <div class="stat-row">
          <span class="stat-label">Level</span>
          <span class="stat-value">{actor.level} {actor.class}</span>
        </div>
      {/if}

      <!-- Status Indicators -->
      {#if actor.isConcentrating || (actor.conditions && actor.conditions.length > 0)}
        <div class="stat-row">
          <span class="stat-label">Status</span>
          <div class="status-tags">
            {#if actor.isConcentrating}
              <span class="status-tag status-tag--concentrating"
                >Concentrating</span
              >
            {/if}
            {#each actor.conditions || [] as condition}
              <span class="status-tag">{condition}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

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

  .pill-dropdown-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid var(--color-border-default);
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .stat-label {
    min-width: 50px;
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .stat-value {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-semibold);
  }

  /* HP Bar */
  .hp-bar-container {
    position: relative;
    flex: 1;
    height: 20px;
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .hp-bar-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    transition:
      width var(--transition-normal),
      background-color var(--transition-normal);
  }

  .hp-bar-text {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    text-shadow: var(--shadow-text);
    z-index: 2; /* Above HP bar fill */
  }

  /* Status Tags */
  .status-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .status-tag {
    padding: 2px var(--space-xs);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .status-tag--concentrating {
    background-color: var(--color-accent-secondary);
    border-color: var(--color-accent-secondary);
    color: white;
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
