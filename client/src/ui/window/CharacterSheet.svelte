<script lang="ts">
/**
 * CharacterSheet - Player/NPC character sheet window.
 * 
 * Displays full character details, stats, inventory, spells.
 */

interface Props {
  characterId: string;
}

let { characterId }: Props = $props();
</script>

<div class="character-sheet">
  <div class="component-label">
    <strong>CharacterSheet</strong>
  </div>
  <p class="component-description">
    Character: {characterId}
  </p>
  
  <div class="character-sections">
    <section class="character-section">
      <h5>Stats</h5>
      <div class="stat-grid">
        <div class="stat">STR: 16 (+3)</div>
        <div class="stat">DEX: 14 (+2)</div>
        <div class="stat">CON: 15 (+2)</div>
        <div class="stat">INT: 10 (+0)</div>
        <div class="stat">WIS: 12 (+1)</div>
        <div class="stat">CHA: 8 (-1)</div>
      </div>
    </section>
    
    <section class="character-section">
      <h5>Inventory</h5>
      <ul>
        <li>Longsword</li>
        <li>Shield</li>
        <li>Potion of Healing (x3)</li>
      </ul>
    </section>
    
    <section class="character-section">
      <h5>Spells</h5>
      <ul>
        <li>Cure Wounds</li>
        <li>Shield of Faith</li>
        <li>Bless</li>
      </ul>
    </section>
  </div>
</div>

<style>
  .character-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .component-label strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .component-description {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .character-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .character-section {
    padding: var(--space-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
  }

  .character-section h5 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-sm);
  }

  .stat {
    padding: var(--space-xs);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: center;
  }

  ul {
    margin: 0;
    padding-left: var(--space-lg);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  li {
    margin-bottom: var(--space-xs);
  }
</style>
