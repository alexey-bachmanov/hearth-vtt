<script lang="ts">
  /**
   * ActorPills - Container for party actor pills.
   *
   * Displays party-controlled actors in a horizontal row.
   * Each pill shows quick stats and provides actions.
   * Filtered by seat permissions.
   */

  import { campaignState } from '../../state/campaign.svelte';
  import { uiState } from '../../state/ui.svelte';
  import ActorPill from './ActorPill.svelte';

  // Active dropdown state (actorId or null)
  let activeDropdown = $state<string | null>(null);

  // Get party actors using $derived
  const partyActors = $derived(campaignState.getPartyActors());

  /**
   * Toggle dropdown for a specific actor pill.
   */
  function toggleDropdown(actorId: string) {
    activeDropdown = activeDropdown === actorId ? null : actorId;
  }

  /**
   * Close dropdown when clicking outside.
   */
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.actor-pill')) {
      activeDropdown = null;
    }
  }

  /**
   * Center map on actor's token (placeholder).
   */
  function centerOnActor(actorId: string) {
    console.log('[ActorPills] Center on actor:', actorId);
    activeDropdown = null;
    // TODO: Implement when viewport control is available
  }

  /**
   * Open a character sheet floating window for the given actor.
   * Context key `characterId` matches the CharacterSheet component prop.
   */
  function openCharacterSheet(actorId: string) {
    const actor = partyActors.find((a) => a.id === actorId);
    uiState.openWindow({
      type: 'actor-sheet',
      title: actor?.name ?? 'Character Sheet',
      context: { characterId: actorId },
    });
    activeDropdown = null;
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="actor-pills">
  {#each partyActors as actor (actor.id)}
    <ActorPill
      {actor}
      isActive={activeDropdown === actor.id}
      ontoggle={toggleDropdown}
      oncenter={centerOnActor}
      onopensheet={openCharacterSheet}
    />
  {/each}
</div>

<style>
  .actor-pills {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
    pointer-events: all;
    align-self: flex-start;
  }
</style>
