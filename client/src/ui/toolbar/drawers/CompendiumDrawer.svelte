<script lang="ts">
/**
 * CompendiumDrawer component.
 *
 * Search and browse game content (spells, items, monsters, etc.).
 */
import { Icon } from '../../shared';
import { Sword, Backpack, Skull, BookOpen } from 'lucide-svelte';
</script>

<div class="drawer__section-list">
  <div class="drawer__section">
    <input
      type="search"
      class="form-input"
      placeholder="Search compendium..."
      aria-label="Search compendium"
    />
  </div>

  <div class="drawer__section">
    <h3 class="drawer__section-title">Categories</h3>
    <div class="category-grid">
      <button class="category-card">
        <span class="category-card__icon"><Icon icon={Sword} label="Spells" size={32} /></span>
        <span class="category-card__name">Spells</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon"><Icon icon={Backpack} label="Items" size={32} /></span>
        <span class="category-card__name">Items</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon"><Icon icon={Skull} label="Monsters" size={32} /></span>
        <span class="category-card__name">Monsters</span>
      </button>
      <button class="category-card">
        <span class="category-card__icon"><Icon icon={BookOpen} label="Rules" size={32} /></span>
        <span class="category-card__name">Rules</span>
      </button>
    </div>
  </div>
</div>

<style>
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
    line-height: 0;
  }

  .category-card__name {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }
</style>
