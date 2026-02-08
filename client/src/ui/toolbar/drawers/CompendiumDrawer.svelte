<script lang="ts">
/**
 * CompendiumDrawer component.
 *
 * Search and browse game content (spells, items, monsters, etc.).
 */
</script>

<div class="drawer-content">
  <div class="drawer-section">
    <input
      type="search"
      class="form-input"
      placeholder="Search compendium..."
      aria-label="Search compendium"
    />
  </div>

  <div class="drawer-section">
    <h3 class="drawer-section__title">Categories</h3>
    <div class="category-grid">
      <button class="category-card">
        <span class="category-card__icon">⚔️</span>
        <span class="category-card__name">Spells</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon">🎒</span>
        <span class="category-card__name">Items</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon">👹</span>
        <span class="category-card__name">Monsters</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon">📖</span>
        <span class="category-card__name">Rules</span>
      </button>
    </div>
  </div>
</div>

<style>
  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .drawer-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .drawer-section__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm);
  }

  .category-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .category-card:hover {
    background-color: var(--color-bg-hover);
    border-color: var(--color-border-hover);
    transform: translateY(-2px);
  }

  .category-card__icon {
    font-size: var(--font-size-3xl);
  }

  .category-card__name {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }
</style>
