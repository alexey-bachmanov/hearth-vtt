<script lang="ts">
/**
 * CompendiumDrawer - Ruleset reference browser.
 * 
 * Browse spells, items, feats, abilities from loaded rulesets.
 */
</script>

<div class="compendium-drawer">
  <div class="component-label">
    <strong>CompendiumDrawer</strong>
  </div>
  <p class="component-description">
    Browse spells, items, feats from rulesets
  </p>
  <div class="placeholder-content">
    <div class="compendium-list">
      <div class="compendium-item">⚔️ Longsword</div>
      <div class="compendium-item">🔮 Fireball</div>
      <div class="compendium-item">🛡️ Shield of Faith</div>
      <div class="compendium-item">📜 Arcane Recovery</div>
      <div class="compendium-item">🗡️ Sneak Attack</div>
    </div>
  </div>
</div>

<style>
  .compendium-drawer {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
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

  .placeholder-content {
    margin-top: var(--space-md);
  }

  .compendium-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .compendium-item {
    padding: var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .compendium-item:hover {
    background-color: var(--color-bg-elevated);
    border-color: var(--color-accent-primary);
    color: var(--color-text-primary);
  }
</style>
